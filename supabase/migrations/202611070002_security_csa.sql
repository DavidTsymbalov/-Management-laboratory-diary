-- Additive security layer. Bootstrap the first CSA separately by exact Auth UUID.
begin;
create table if not exists public.csa_accounts(user_id uuid primary key references auth.users(id) on delete cascade,name text not null check(length(btrim(name)) between 1 and 200));
create table if not exists public.staff_login_names(user_id uuid primary key references auth.users(id) on delete cascade,login text not null);
create table if not exists public.security_account_state(user_id uuid primary key references auth.users(id) on delete cascade,disabled boolean not null default false,mfa_required boolean not null default false,sessions_after timestamptz);
create table if not exists public.security_session_blocks(session_id uuid primary key,user_id uuid not null,revoked_by uuid,revoked_at timestamptz not null default now());
create table if not exists public.security_login_seen(session_id uuid primary key,user_id uuid not null);
create table if not exists public.security_events(
 id bigint generated always as identity primary key,event_key text unique,actor_id uuid,actor_name text not null,actor_role text not null,
 action text not null,target_id uuid,target_name text,details jsonb not null default '{}'::jsonb,session_id uuid,device text,ip text,created_at timestamptz not null default clock_timestamp()
);
create index if not exists security_events_actor on public.security_events(actor_id,id desc);
create index if not exists security_events_target on public.security_events(target_id,id desc);
create table if not exists public.security_operations(id uuid primary key default gen_random_uuid(),actor_id uuid not null,session_id uuid not null,action text not null,target_id uuid,outcome text not null default 'pending' check(outcome in ('pending','success','failure')));
create table if not exists public.chat_reaction_display(key text primary key check(key=any(array['💩','❤️','😂','🔥','👏','👻','🎉','⚡'])),glyph text not null check(length(glyph) between 1 and 32),label text not null check(length(btrim(label)) between 1 and 50));
insert into public.chat_reaction_display values ('💩','💩','Какашка'),('❤️','❤️','Сердце'),('😂','😂','Смех'),('🔥','🔥','Огонь'),('👏','👏','Аплодисменты'),('👻','👻','Привидение'),('🎉','🎉','Праздник'),('⚡','⚡','Молния') on conflict do nothing;

create or replace function public.security_claims() returns jsonb language sql stable set search_path='' as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
create or replace function public.security_session_id() returns uuid language sql stable set search_path='' as $$
 select case when public.security_claims()->>'session_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (public.security_claims()->>'session_id')::uuid else null end $$;
create or replace function public.security_raw_role(actor uuid) returns text language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.csa_accounts where user_id=actor) then 'csa' when exists(select 1 from public.teachers where user_id=actor) then 'teacher'
 when exists(select 1 from public.student_administrators where student_id=actor) then 'admin' when exists(select 1 from public.students where id=actor) then 'student' end $$;
create or replace function public.security_mfa_needed(actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.security_raw_role(actor)='csa' or exists(select 1 from public.security_account_state a where a.user_id=actor and a.mfa_required) or exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.status::text='verified' and f.factor_type::text='totp') $$;
create or replace function public.security_live_session(actor uuid,sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select actor is not null and sid is not null and exists(select 1 from auth.sessions s where s.id=sid and s.user_id=actor and
  (to_jsonb(s)->>'not_after' is null or (to_jsonb(s)->>'not_after')::timestamptz>now()) and
  not exists(select 1 from public.security_account_state a where a.user_id=actor and (a.disabled or (a.sessions_after is not null and s.created_at<a.sessions_after))))
  and not exists(select 1 from public.security_session_blocks b where b.session_id=sid) $$;
create or replace function public.security_session_valid() returns boolean language sql stable security definer set search_path='' as $$
 select public.security_live_session(auth.uid(),public.security_session_id()) and (not coalesce(public.security_mfa_needed(auth.uid()),false) or coalesce(public.security_claims()->>'aal'='aal2',false)) $$;
create or replace function public.is_csa() returns boolean language sql stable security definer set search_path='' as $$ select public.security_session_valid() and exists(select 1 from public.csa_accounts where user_id=auth.uid()) $$;
create or replace function public.is_teacher() returns boolean language sql stable security definer set search_path='' as $$ select public.security_session_valid() and coalesce(public.security_raw_role(auth.uid()) in ('teacher','csa'),false) $$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path='' as $$ select public.security_session_valid() and coalesce(public.security_raw_role(auth.uid()) in ('teacher','csa','admin'),false) $$;
create or replace function public.classroom_actor_name(actor uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select name from public.csa_accounts where user_id=actor),(select name from public.teachers where user_id=actor),(select name from public.students where id=actor),'Сервис Supabase') $$;
create or replace function public.security_actor() returns uuid language sql stable set search_path='' as $$ select coalesce(auth.uid(),nullif(current_setting('app.security_actor',true),'')::uuid) $$;
create or replace function public.security_actor_session() returns uuid language sql stable set search_path='' as $$ select coalesce(public.security_session_id(),nullif(current_setting('app.security_session',true),'')::uuid) $$;
create or replace function public.append_security_event(actor uuid,sid uuid,event_action text,event_target uuid,event_name text,event_details jsonb default '{}'::jsonb,event_unique text default null) returns void
 language plpgsql security definer set search_path='' as $$
declare device_name text; address text;
begin
 select left(to_jsonb(s)->>'user_agent',300),left(to_jsonb(s)->>'ip',100) into device_name,address from auth.sessions s where s.id=sid and s.user_id=actor;
 insert into public.security_events(event_key,actor_id,actor_name,actor_role,action,target_id,target_name,details,session_id,device,ip)
 values(event_unique,actor,public.classroom_actor_name(actor),coalesce(public.security_raw_role(actor),'system'),event_action,event_target,left(event_name,300),coalesce(event_details,'{}'),sid,device_name,address) on conflict(event_key) do nothing;
end $$;

create or replace function public.security_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); sid uuid:=public.security_session_id(); role_name text:=public.security_raw_role(actor); active boolean:=public.security_live_session(actor,sid);
begin
 return jsonb_build_object('id',actor,'session_id',sid,'role',role_name,'name',public.classroom_actor_name(actor),'active',active,
 'requires_mfa',coalesce(public.security_mfa_needed(actor),false) and public.security_claims()->>'aal' is distinct from 'aal2',
 'mfa_enrolled',exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.status::text='verified' and f.factor_type::text='totp'));
end $$;
create or replace function public.register_security_session() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); sid uuid:=public.security_session_id(); inserted uuid;
begin
 if not public.security_session_valid() or public.security_raw_role(actor) is null then raise exception 'Подтвердите вход или войдите снова.'; end if;
 insert into public.security_login_seen values(sid,actor) on conflict do nothing returning session_id into inserted;
 if inserted is not null then perform public.append_security_event(actor,sid,'auth_login',actor,public.classroom_actor_name(actor),jsonb_build_object('aal',public.security_claims()->>'aal')); end if;
end $$;
create or replace function public.security_service_actor(actor uuid,sid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.security_raw_role(actor) is null or not public.security_live_session(actor,sid) then raise exception 'Сессия отозвана. Войдите снова.'; end if;
 if coalesce(public.security_mfa_needed(actor),false) and not exists(select 1 from auth.sessions s where s.id=sid and to_jsonb(s)->>'aal'='aal2') then raise exception 'Подтвердите вход кодом 2FA.'; end if;
 perform set_config('app.security_actor',actor::text,true);perform set_config('app.security_session',sid::text,true);
end $$;

create or replace function public.security_activity_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind not in ('points','attendance_mark') then perform public.append_security_event(new.actor_id,public.security_actor_session(),new.kind,new.student_id,new.student_name,jsonb_strip_nulls(jsonb_build_object('title',new.title,'amount',new.amount,'limits',case when new.kind in ('admin_grant','admin_limits') then (select jsonb_build_object('capacity',capacity_limit,'deleted',deleted_limit,'points',points_limit,'awards',awards_limit) from public.student_administrators where student_id=new.student_id) end))); end if;
 return new;
end $$;
drop trigger if exists security_activity_capture on public.classroom_activity;
create trigger security_activity_capture after insert on public.classroom_activity for each row execute function public.security_activity_trigger();
create or replace function public.security_points_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.nuts is distinct from old.nuts then perform public.append_security_event(public.security_actor(),public.security_actor_session(),'points',new.id,new.name,jsonb_build_object('before',old.nuts,'after',new.nuts,'amount',new.nuts-old.nuts)); end if;
 return new;
end $$;
drop trigger if exists security_points_capture on public.students;
create trigger security_points_capture after update of nuts on public.students for each row execute function public.security_points_trigger();
create or replace function public.security_csa_role_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.append_security_event(public.security_actor(),public.security_actor_session(),'csa_granted',new.user_id,new.name);return new;
end $$;
drop trigger if exists security_csa_role_capture on public.csa_accounts;
create trigger security_csa_role_capture after insert on public.csa_accounts for each row execute function public.security_csa_role_trigger();

insert into public.security_account_state(user_id,mfa_required) select distinct user_id,true from auth.mfa_factors where status::text='verified' and factor_type::text='totp' on conflict(user_id) do update set mfa_required=true;

-- Capture provider-level credential changes too; never retain password hashes or TOTP secrets.
create or replace function public.security_auth_user_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password or new.email is distinct from old.email then
  insert into public.security_account_state(user_id,sessions_after) values(new.id,clock_timestamp()) on conflict(user_id) do update set sessions_after=clock_timestamp();
  perform public.append_security_event(null,null,case when new.encrypted_password is distinct from old.encrypted_password then 'auth_password_changed' else 'auth_identity_changed' end,new.id,public.classroom_actor_name(new.id));
 end if;return new;
end $$;
drop trigger if exists security_auth_user_capture on auth.users;
create trigger security_auth_user_capture after update of encrypted_password,email on auth.users for each row execute function public.security_auth_user_trigger();
create or replace function public.security_mfa_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if TG_OP='DELETE' then
  if old.status::text='verified' then
   target:=old.user_id;
   if exists(select 1 from auth.users where id=target) then
    insert into public.security_account_state(user_id,sessions_after,mfa_required) values(target,clock_timestamp(),true) on conflict(user_id) do update set sessions_after=clock_timestamp(),mfa_required=true;
   end if;
   perform public.append_security_event(null,null,'mfa_factor_removed',target,public.classroom_actor_name(target));
  end if;return old;
 end if;
 if new.status::text='verified' and (TG_OP='INSERT' or old.status::text is distinct from 'verified') then
  insert into public.security_account_state(user_id,mfa_required) values(new.user_id,true) on conflict(user_id) do update set mfa_required=true;
  perform public.append_security_event(null,null,'mfa_enabled',new.user_id,public.classroom_actor_name(new.user_id));
 end if;return new;
end $$;
drop trigger if exists security_mfa_capture on auth.mfa_factors;
create trigger security_mfa_capture after insert or update of status or delete on auth.mfa_factors for each row execute function public.security_mfa_trigger();
create or replace function public.security_attendance_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare lesson_day date;
begin
 if (TG_OP='INSERT' and new.status is not null) or (TG_OP='UPDATE' and new.status is distinct from old.status) then
  select lesson_date into lesson_day from public.attendance_lessons where id=new.lesson_id;
  perform public.append_security_event(public.security_actor(),public.security_actor_session(),'attendance_mark',new.student_key,new.student_name,
  jsonb_build_object('lesson_date',lesson_day,'before',case when TG_OP='UPDATE' then old.status end,'after',new.status));
 end if;return new;
end $$;
drop trigger if exists security_attendance_capture on public.attendance_records;
create trigger security_attendance_capture after insert or update of status on public.attendance_records for each row execute function public.security_attendance_trigger();

create or replace function public.list_security_events(before_id bigint default null,actor_filter uuid default null,target_filter uuid default null,action_filter text default null) returns setof public.security_events
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_teacher() then raise exception 'Журнал безопасности доступен преподавателю и CSA.'; end if;
 return query select * from public.security_events e where (before_id is null or e.id<before_id) and (actor_filter is null or e.actor_id=actor_filter)
 and (target_filter is null or e.target_id=target_filter) and (nullif(action_filter,'') is null or e.action=action_filter) order by e.id desc limit 100;
end $$;
create or replace function public.list_security_sessions(target_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.security_session_valid() or not(target_user=auth.uid() or public.is_csa() or (public.is_teacher() and exists(select 1 from public.students where id=target_user))) then raise exception 'Нет доступа к устройствам аккаунта.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'created_at',s.created_at,'updated_at',s.updated_at,'device',left(to_jsonb(s)->>'user_agent',300),'ip',left(to_jsonb(s)->>'ip',100),'current',s.id=public.security_session_id(),'revoked',not public.security_live_session(target_user,s.id)) order by s.created_at desc),'[]') into result from auth.sessions s where s.user_id=target_user;
 return result;
end $$;
create or replace function public.revoke_security_session(target_session uuid) returns void language plpgsql security definer set search_path='' as $$
declare target uuid; saved uuid;
begin
 select user_id into target from auth.sessions where id=target_session;
 if target is null then raise exception 'Сессия уже завершена.'; end if;
 if not public.security_session_valid() or not(target=auth.uid() or public.is_csa() or (public.is_teacher() and exists(select 1 from public.students where id=target))) then raise exception 'Нет доступа к устройствам аккаунта.'; end if;
 insert into public.security_session_blocks(session_id,user_id,revoked_by) values(target_session,target,auth.uid()) on conflict do nothing returning session_id into saved;
 if saved is not null then perform public.append_security_event(auth.uid(),public.security_session_id(),'session_revoked',target,public.classroom_actor_name(target),jsonb_build_object('revoked_session',target_session)); end if;
 delete from auth.sessions where id=target_session;
end $$;
create or replace function public.security_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_teacher() then raise exception 'Список безопасности доступен преподавателю и CSA.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'login',p.login,'role',p.role,'disabled',coalesce(a.disabled,false),'mfa',exists(select 1 from auth.mfa_factors f where f.user_id=p.id and f.status::text='verified' and f.factor_type::text='totp')) order by p.role,p.name),'[]') into result from (
  select c.user_id as id,c.name,split_part(u.email,'@',1) as login,'csa' as role from public.csa_accounts c join auth.users u on u.id=c.user_id
  union all select t.user_id,t.name,coalesce((select login from public.staff_login_names where user_id=t.user_id),'teacher'),'teacher' from public.teachers t where not exists(select 1 from public.csa_accounts where user_id=t.user_id)
  union all select s.id,s.name,s.login_name,case when exists(select 1 from public.student_administrators where student_id=s.id) then 'admin' else 'student' end from public.students s where not exists(select 1 from public.teachers where user_id=s.id) and not exists(select 1 from public.csa_accounts where user_id=s.id)
 ) p left join public.security_account_state a on a.user_id=p.id;
 return result;
end $$;
create or replace function public.csa_account_enabled(target_user uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_csa() then raise exception 'Только CSA управляет блокировкой аккаунтов.'; end if;
 if enabled is null or target_user=auth.uid() or not exists(select 1 from auth.users where id=target_user) then raise exception 'Выберите другой аккаунт.'; end if;
 insert into public.security_account_state(user_id,disabled,sessions_after) values(target_user,not enabled,clock_timestamp()) on conflict(user_id) do update set disabled=not enabled,sessions_after=clock_timestamp();
 perform public.append_security_event(auth.uid(),public.security_session_id(),case when enabled then 'account_enabled' else 'account_disabled' end,target_user,public.classroom_actor_name(target_user));
end $$;
create or replace function public.csa_update_student(target_student uuid,display_name text,new_balance integer,remove_awards uuid[] default '{}') returns void language plpgsql security definer set search_path='' as $$
declare previous_name text; removed record;
begin
 if not public.is_csa() then raise exception 'Только CSA редактирует расширенные настройки.'; end if;
 if length(btrim(display_name)) not between 1 and 200 or display_name is null or new_balance is null or new_balance not between 0 and 1000000000 then raise exception 'Проверьте имя и баланс.'; end if;
 select name into previous_name from public.students where id=target_student for update;
 if not found then raise exception 'Ученик не найден.'; end if;
 if exists(select 1 from public.achievements where id=any(remove_awards) and student_id<>target_student) then raise exception 'Награда принадлежит другому ученику.'; end if;
 update public.students set name=btrim(display_name),nuts=new_balance where id=target_student;
 if previous_name<>btrim(display_name) then perform public.append_security_event(auth.uid(),public.security_session_id(),'profile_changed',target_student,btrim(display_name),jsonb_build_object('before_name',previous_name,'after_name',btrim(display_name))); end if;
 for removed in delete from public.achievements where id=any(remove_awards) and student_id=target_student returning title loop
 perform public.append_security_event(auth.uid(),public.security_session_id(),'achievement_revoked',target_student,btrim(display_name),jsonb_build_object('title',removed.title));end loop;
end $$;
create or replace function public.csa_rename_staff(target_user uuid,display_name text) returns void language plpgsql security definer set search_path='' as $$
declare previous_name text; role_name text;
begin
 if not public.is_csa() then raise exception 'Только CSA редактирует сотрудников.';end if;
 if display_name is null or length(btrim(display_name)) not between 1 and 200 then raise exception 'Укажите имя до 200 символов.';end if;
 role_name:=public.security_raw_role(target_user);previous_name:=public.classroom_actor_name(target_user);
 if role_name='csa' then update public.csa_accounts set name=btrim(display_name) where user_id=target_user;
 elsif role_name='teacher' then update public.teachers set name=btrim(display_name) where user_id=target_user;
 else raise exception 'Выберите сотрудника.';end if;
 if previous_name<>btrim(display_name) then perform public.append_security_event(auth.uid(),public.security_session_id(),'profile_changed',target_user,btrim(display_name),jsonb_build_object('before_name',previous_name,'after_name',btrim(display_name)));end if;
end $$;
create or replace function public.csa_reaction_display(items jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; old_items jsonb;
begin
 if not public.is_csa() then raise exception 'Только CSA меняет эмодзи.'; end if;
 if jsonb_typeof(items) is distinct from 'array' then raise exception 'Укажите восемь реакций.'; end if;
 if jsonb_array_length(items)<>8 or (select count(distinct value->>'key') from jsonb_array_elements(items))<>8 then raise exception 'Укажите восемь разных слотов реакций.'; end if;
 select jsonb_agg(to_jsonb(r) order by key) into old_items from public.chat_reaction_display r;
 for item in select value from jsonb_array_elements(items) loop
  if not exists(select 1 from public.chat_reaction_display where key=item->>'key') or char_length(item->>'glyph') not between 1 and 32 or item->>'glyph' is null or char_length(btrim(item->>'label')) not between 1 and 50 or item->>'label' is null then raise exception 'Проверьте эмодзи и названия реакций.'; end if;
  update public.chat_reaction_display set glyph=item->>'glyph',label=btrim(item->>'label') where key=item->>'key';
 end loop;
 perform public.append_security_event(auth.uid(),public.security_session_id(),'reactions_changed',null,'Эмодзи чатов',jsonb_build_object('before',old_items,'after',items));
end $$;

-- Service-only operations: Edge verifies the user's JWT and AAL before calling.
create or replace function public.security_begin_operation(actor uuid,sid uuid,operation text,target_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare op uuid; role_name text;
begin
 perform public.security_service_actor(actor,sid);role_name:=public.security_raw_role(actor);
 if operation not in ('password_read','password_reset','mfa_reset','staff_create') then raise exception 'Неизвестное действие безопасности.'; end if;
 if operation in ('mfa_reset','staff_create') and role_name<>'csa' then raise exception 'Только CSA может выполнить действие.'; end if;
 if operation in ('password_read','password_reset') and role_name not in ('teacher','csa') then raise exception 'Доступно преподавателю и CSA.'; end if;
 if operation in ('password_read','password_reset') and role_name<>'csa' and (not exists(select 1 from public.students where id=target_user) or public.security_raw_role(target_user) in ('teacher','csa')) then raise exception 'Преподаватель управляет только паролями учеников.'; end if;
 if operation='password_read' and not exists(select 1 from public.students where id=target_user) then raise exception 'Пароли сотрудников не раскрываются. Можно задать новый.'; end if;
 if operation='mfa_reset' and target_user=actor then raise exception 'Для собственного восстановления 2FA используйте владельца Supabase.'; end if;
 insert into public.security_operations(actor_id,session_id,action,target_id) values(actor,sid,operation,target_user) returning id into op;
 -- Revoke existing sessions before changing credentials, including a partially failed Auth operation.
 if operation in ('password_reset','mfa_reset') then
  insert into public.security_account_state(user_id,sessions_after) values(target_user,clock_timestamp()) on conflict(user_id) do update set sessions_after=clock_timestamp();
 end if;
 perform public.append_security_event(actor,sid,operation,target_user,case when target_user is not null then public.classroom_actor_name(target_user) end,jsonb_build_object('outcome','pending','operation_id',op));return op;
end $$;
create or replace function public.security_finish_operation(operation_id uuid,succeeded boolean) returns void language plpgsql security definer set search_path='' as $$
declare op public.security_operations;
begin
 select * into op from public.security_operations where id=operation_id for update;
 if not found or op.outcome<>'pending' then return;end if;
 update public.security_operations set outcome=case when succeeded then 'success' else 'failure' end where id=operation_id;
 perform public.append_security_event(op.actor_id,op.session_id,op.action,op.target_id,case when op.target_id is not null then public.classroom_actor_name(op.target_id) end,jsonb_build_object('outcome',case when succeeded then 'success' else 'failure' end,'operation_id',op.id));
end $$;
create or replace function public.csa_finalize_staff(actor uuid,sid uuid,target_user uuid,staff_role text,display_name text,staff_login text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.security_service_actor(actor,sid);
 if public.security_raw_role(actor)<>'csa' or staff_role not in ('teacher','csa') then raise exception 'Только CSA создаёт сотрудников.'; end if;
 if public.security_raw_role(target_user) is not null or display_name is null or length(btrim(display_name)) not between 1 and 200 then raise exception 'Проверьте новый аккаунт.'; end if;
 insert into public.staff_login_names values(target_user,staff_login);
 if staff_role='csa' then insert into public.csa_accounts values(target_user,btrim(display_name));else insert into public.teachers values(target_user,btrim(display_name));end if;
 perform public.append_security_event(actor,sid,'staff_created',target_user,btrim(display_name),jsonb_build_object('role',staff_role));
end $$;
create or replace function public.csa_delete_account(actor uuid,sid uuid,target_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare target_name text;
begin
 perform public.security_service_actor(actor,sid);
 if public.security_raw_role(actor)<>'csa' then raise exception 'Только CSA удаляет сотрудников.';end if;
 if target_user=actor or not exists(select 1 from auth.users where id=target_user) then raise exception 'Выберите другой аккаунт.'; end if;
 perform pg_advisory_xact_lock(20261107,2);
 if exists(select 1 from public.csa_accounts where user_id=target_user) and (select count(*) from public.csa_accounts)<=1 then raise exception 'Нельзя удалить последний аккаунт CSA.';end if;
 target_name:=public.classroom_actor_name(target_user);
 perform public.append_security_event(actor,sid,'account_deleted',target_user,target_name);
 delete from auth.users where id=target_user;
end $$;

create or replace function public.consume_administrator_quota(actor uuid, operation text, units integer) returns void
language plpgsql security definer set search_path = '' as $$
declare caps public.student_administrators; used public.administrator_usage;
  today date := (now() at time zone 'Europe/Moscow')::date;
  maximum integer; spent integer;
begin
  if units is null or units < 0 then raise exception 'Некорректный расход лимита.'; end if;
  -- The same actor lock serializes quota use, promotion, revocation and member changes.
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  if (exists(select 1 from public.teachers where user_id=actor) or exists(select 1 from public.csa_accounts where user_id=actor)) then return; end if;
  select * into caps from public.student_administrators where student_id=actor for update;
  if not found then raise exception 'Доступ администратора не назначен.'; end if;
  insert into public.administrator_usage(student_id,day) values(actor,today) on conflict do nothing;
  select * into used from public.administrator_usage where student_id=actor and day=today for update;
  case operation
    when 'create' then maximum:=caps.capacity_limit; select count(*) into spent from public.students;
    when 'delete' then maximum:=caps.deleted_limit; spent:=used.deleted;
    when 'points' then maximum:=caps.points_limit; spent:=used.points;
    when 'achievement' then maximum:=caps.awards_limit; spent:=used.awards;
    else raise exception 'Неизвестный вид лимита.';
  end case;
  if spent::bigint + units > maximum then
    if operation='create' then raise exception 'В классе уже % участников. Ваш лимит — %. Освободите место или обратитесь к преподавателю.',spent,maximum; end if;
    raise exception 'Превышен дневной лимит. Осталось: %. Сброс в 00:00 по Москве.', greatest(0,maximum-spent);
  end if;
  update public.administrator_usage set
    added=added+case when operation='create' then units else 0 end,
    deleted=deleted+case when operation='delete' then units else 0 end,
    points=points+case when operation='points' then units else 0 end,
    awards=awards+case when operation='achievement' then units else 0 end
  where student_id=actor and day=today;
end $$;

create or replace function public.configure_student_administrator(target_id uuid, limits jsonb, enabled boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare target_name text; existed boolean; field text;
begin
  if not public.is_teacher() then raise exception 'Только преподаватель назначает администраторов.'; end if;
  perform pg_advisory_xact_lock(20261106,1);
  perform pg_advisory_xact_lock(hashtextextended(target_id::text,0));
  select name into target_name from public.students where id=target_id for update;
  if not found or exists(select 1 from public.teachers where user_id=target_id) then raise exception 'Выберите ученика.'; end if;
  existed := exists(select 1 from public.student_administrators where student_id=target_id);
  if enabled is null then raise exception 'Укажите действие.'; end if;
  if enabled then
    foreach field in array array['capacity','deleted','points','awards'] loop
      if jsonb_typeof(limits->field) is distinct from 'number' or
        (limits->>field) !~ '^[0-9]{1,7}$' or (limits->>field)::bigint > 1000000 then
        raise exception 'Лимиты должны быть целыми числами от 0 до 1000000.';
      end if;
    end loop;
    insert into public.student_administrators(student_id,capacity_limit,deleted_limit,points_limit,awards_limit,granted_by)
      values(target_id,(limits->>'capacity')::integer,(limits->>'deleted')::integer,
        (limits->>'points')::integer,(limits->>'awards')::integer,case when exists(select 1 from public.teachers where user_id=auth.uid()) then auth.uid() else null end)
      on conflict(student_id) do update set capacity_limit=excluded.capacity_limit, deleted_limit=excluded.deleted_limit,
        points_limit=excluded.points_limit, awards_limit=excluded.awards_limit;
  else
    delete from public.student_administrators where student_id=target_id;
    if not existed then return; end if;
  end if;
  insert into public.classroom_activity(actor_id,actor_name,kind,student_id,student_name)
    values(auth.uid(),public.classroom_actor_name(auth.uid()),
      case when not enabled then 'admin_revoke' when existed then 'admin_limits' else 'admin_grant' end,target_id,target_name);
end $$;

create or replace function public.staff_provision_student(actor uuid, student_id uuid, student_name text, student_login text,
  initial_nuts integer default 0, initial_achievements jsonb default '[]'::jsonb, encrypted_password text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (exists(select 1 from public.teachers where user_id=actor) or exists(select 1 from public.csa_accounts where user_id=actor)) and
    (initial_nuts is distinct from 0 or initial_achievements is distinct from '[]'::jsonb) then
    raise exception 'Администратор создаёт учеников только с нулевым балансом и без наград.';
  end if;
  perform pg_advisory_xact_lock(20261106,1);
  perform public.consume_administrator_quota(actor,'create',1);
  perform public.provision_student(student_id,student_name,student_login,initial_nuts,initial_achievements);
  insert into public.student_credentials(student_id,ciphertext) values(student_id,encrypted_password);
  insert into public.classroom_activity(actor_id,actor_name,kind,student_id,student_name)
    values(actor,public.classroom_actor_name(actor),'create',student_id,student_name);
end $$;

create or replace function public.staff_delete_student(actor uuid, target_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target_name text;
begin
  perform pg_advisory_xact_lock(20261106,1);
  select name into target_name from public.students where id=target_id for update;
  if not found then raise exception 'Ученик не найден.'; end if;
  if exists(select 1 from public.teachers where user_id=target_id) or exists(select 1 from public.csa_accounts where user_id=target_id) then raise exception 'Нельзя удалить сотрудника через список учеников.'; end if;
  if not (exists(select 1 from public.teachers where user_id=actor) or exists(select 1 from public.csa_accounts where user_id=actor)) and
    (target_id=actor or exists(select 1 from public.student_administrators where student_id=target_id)) then
    raise exception 'Нельзя удалить себя или другого администратора.';
  end if;
  perform public.consume_administrator_quota(actor,'delete',1);
  insert into public.classroom_activity(actor_id,actor_name,kind,student_id,student_name)
    values(actor,public.classroom_actor_name(actor),'delete',target_id,target_name);
  -- Delete the auth primary key and its cascades in the same transaction as quota/audit.
  -- This application has no user-owned Storage objects. An FK failure rolls back everything.
  delete from auth.users where id=target_id;
end $$;

create or replace function public.secure_provision_student(actor uuid,sid uuid,student_id uuid,student_name text,student_login text,initial_nuts integer default 0,initial_achievements jsonb default '[]',encrypted_password text default null) returns void language plpgsql security definer set search_path='' as $$
begin perform public.security_service_actor(actor,sid);if public.security_raw_role(actor) not in ('teacher','admin','csa') then raise exception 'Действие недоступно.';end if;
 perform public.staff_provision_student(actor,student_id,student_name,student_login,initial_nuts,initial_achievements,encrypted_password);end $$;
create or replace function public.secure_delete_student(actor uuid,sid uuid,target_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform public.security_service_actor(actor,sid);if public.security_raw_role(actor) not in ('teacher','admin','csa') then raise exception 'Действие недоступно.';end if;
 perform public.staff_delete_student(actor,target_id);end $$;

create or replace function public.emoji_pupil_id() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin if not public.security_session_valid() then raise exception 'Сессия отозвана или требует 2FA. Войдите снова.';end if;
 if actor is null or public.is_teacher() or not exists(select 1 from public.students where id=actor) then raise exception 'Чаты доступны только ученикам.';end if;return actor;end $$;
create or replace function public.my_student_rank() returns table(rank bigint,total bigint) language sql stable security definer set search_path='' as $$
 select r.place,r.total from (select id,row_number() over(order by nuts desc,name,id) as place,count(*) over() as total from public.students) r where r.id=auth.uid() and public.security_session_valid() $$;
create or replace function public.my_administrator_quota() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('limits',jsonb_build_object('capacity',a.capacity_limit,'deleted',a.deleted_limit,'points',a.points_limit,'awards',a.awards_limit),
 'used',jsonb_build_object('added',coalesce(u.added,0),'deleted',coalesce(u.deleted,0),'points',coalesce(u.points,0),'awards',coalesce(u.awards,0)),'day',(now() at time zone 'Europe/Moscow')::date)
 from public.student_administrators a left join public.administrator_usage u on u.student_id=a.student_id and u.day=(now() at time zone 'Europe/Moscow')::date
 where a.student_id=auth.uid() and public.security_session_valid() $$;

-- No application role can mutate audit, session state, CSA roles or operations directly.
do $$ declare t text;begin
 foreach t in array array['csa_accounts','staff_login_names','security_account_state','security_session_blocks','security_login_seen','security_events','security_operations','chat_reaction_display'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.security_events_id_seq to service_role;
grant select on public.security_events,public.chat_reaction_display to authenticated;
drop policy if exists security_teacher_read on public.security_events;
create policy security_teacher_read on public.security_events for select to authenticated using((select public.is_teacher()));
drop policy if exists reaction_display_read on public.chat_reaction_display;
create policy reaction_display_read on public.chat_reaction_display for select to authenticated using((select public.security_session_valid()));
do $$ declare t text;begin
 foreach t in array array['teachers','students','achievements','student_administrators','administrator_usage','classroom_activity','student_emoji_messages','student_emoji_reads','student_emoji_blocks','classroom_homework','attendance_lessons','attendance_records','security_events','chat_reaction_display'] loop
 execute format('drop policy if exists security_live_session on public.%I',t);
 execute format('create policy security_live_session on public.%I as restrictive to authenticated using ((select public.security_session_valid())) with check ((select public.security_session_valid()))',t);
 end loop;
end $$;
-- Explicit function grants. Internal helpers cannot be reached through PostgREST.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
 'security_claims','security_session_id','security_raw_role','security_mfa_needed','security_live_session','security_session_valid','is_csa','security_actor','security_actor_session','append_security_event','security_context','register_security_session','security_service_actor',
 'security_auth_user_trigger','security_mfa_trigger','security_attendance_trigger','security_activity_trigger','security_points_trigger','security_csa_role_trigger','list_security_events','list_security_sessions','revoke_security_session','security_accounts','csa_account_enabled','csa_update_student','csa_rename_staff','csa_reaction_display',
 'security_begin_operation','security_finish_operation','csa_finalize_staff','csa_delete_account','secure_provision_student','secure_delete_student']) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
grant execute on function public.security_session_valid(),public.is_csa(),public.security_context(),public.register_security_session(),public.list_security_events(bigint,uuid,uuid,text),public.list_security_sessions(uuid),public.revoke_security_session(uuid),public.security_accounts(),public.csa_account_enabled(uuid,boolean),public.csa_update_student(uuid,text,integer,uuid[]),public.csa_reaction_display(jsonb),public.csa_rename_staff(uuid,text) to authenticated;
grant execute on function public.security_begin_operation(uuid,uuid,text,uuid),public.security_finish_operation(uuid,boolean),public.csa_finalize_staff(uuid,uuid,uuid,text,text,text),public.csa_delete_account(uuid,uuid,uuid),public.secure_provision_student(uuid,uuid,uuid,text,text,integer,jsonb,text),public.secure_delete_student(uuid,uuid,uuid) to service_role;
-- Retire older service entry points: verified-session wrappers are the supported route.
revoke execute on function public.staff_provision_student(uuid,uuid,text,text,integer,jsonb,text),public.staff_delete_student(uuid,uuid) from service_role;
commit;
