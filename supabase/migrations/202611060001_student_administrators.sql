-- Additive migration. Existing pupils, passwords, scores and awards are preserved.
begin;

create table if not exists public.student_administrators (
  student_id uuid primary key references public.students(id) on delete cascade,
  capacity_limit integer not null default 26 check (capacity_limit between 0 and 1000000),
  deleted_limit integer not null default 5 check (deleted_limit between 0 and 1000000),
  points_limit integer not null default 100 check (points_limit between 0 and 1000000),
  awards_limit integer not null default 10 check (awards_limit between 0 and 1000000),
  granted_by uuid references public.teachers(user_id) on delete set null,
  granted_at timestamptz not null default now()
);
create table if not exists public.student_credentials (
  student_id uuid primary key references public.students(id) on delete cascade,
  ciphertext text,
  updated_at timestamptz not null default now()
);
alter table public.student_credentials enable row level security;
revoke all on public.student_credentials from public,anon,authenticated;
grant all on public.student_credentials to service_role;

create table if not exists public.administrator_usage (
  student_id uuid references public.students(id) on delete cascade,
  day date not null,
  added integer not null default 0 check (added >= 0),
  deleted integer not null default 0 check (deleted >= 0),
  points integer not null default 0 check (points >= 0),
  awards integer not null default 0 check (awards >= 0),
  primary key (student_id, day)
);
create table if not exists public.classroom_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  kind text not null check (kind in ('create','delete','points','achievement','admin_grant','admin_revoke','admin_limits')),
  student_id uuid,
  student_name text not null,
  amount integer,
  title text,
  created_at timestamptz not null default now()
);
create index if not exists classroom_activity_created on public.classroom_activity(created_at desc);
create index if not exists classroom_activity_actor on public.classroom_activity(actor_id, created_at desc);
alter table public.student_administrators enable row level security;
alter table public.administrator_usage enable row level security;
alter table public.classroom_activity enable row level security;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_teacher() or exists(select 1 from public.student_administrators where student_id=auth.uid())
$$;

drop policy if exists student_read on public.students;
create policy student_read on public.students for select to authenticated
  using (id=(select auth.uid()) or (select public.is_staff()));
drop policy if exists achievement_read on public.achievements;
create policy achievement_read on public.achievements for select to authenticated
  using (student_id=(select auth.uid()) or (select public.is_staff()));
drop policy if exists student_administrator_read on public.student_administrators;
create policy student_administrator_read on public.student_administrators for select to authenticated
  using ((select public.is_staff()));
drop policy if exists administrator_usage_read on public.administrator_usage;
create policy administrator_usage_read on public.administrator_usage for select to authenticated
  using (student_id=(select auth.uid()) or (select public.is_teacher()));
drop policy if exists classroom_activity_read on public.classroom_activity;
create policy classroom_activity_read on public.classroom_activity for select to authenticated
  using ((select public.is_teacher()) or (actor_id=(select auth.uid()) and (select public.is_staff())));
revoke all on public.student_administrators, public.administrator_usage, public.classroom_activity from public, anon, authenticated;
grant select on public.student_administrators, public.administrator_usage, public.classroom_activity to authenticated;
grant all on public.student_administrators, public.administrator_usage, public.classroom_activity to service_role;

-- Internal helpers are not executable through a browser user's token.
create or replace function public.classroom_actor_name(actor uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select name from public.teachers where user_id=actor),
    (select name from public.students where id=actor), 'Преподаватель')
$$;

create or replace function public.consume_administrator_quota(actor uuid, operation text, units integer) returns void
language plpgsql security definer set search_path = '' as $$
declare caps public.student_administrators; used public.administrator_usage;
  today date := (now() at time zone 'Europe/Moscow')::date;
  maximum integer; spent integer;
begin
  if units is null or units < 0 then raise exception 'Некорректный расход лимита.'; end if;
  -- The same actor lock serializes quota use, promotion, revocation and member changes.
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  if exists(select 1 from public.teachers where user_id=actor) then return; end if;
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
        (limits->>'points')::integer,(limits->>'awards')::integer,auth.uid())
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

create or replace function public.my_administrator_quota() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('limits',jsonb_build_object('capacity',a.capacity_limit,'deleted',a.deleted_limit,'points',a.points_limit,'awards',a.awards_limit),
    'used',jsonb_build_object('added',coalesce(u.added,0),'deleted',coalesce(u.deleted,0),'points',coalesce(u.points,0),'awards',coalesce(u.awards,0)),
    'day',(now() at time zone 'Europe/Moscow')::date)
  from public.student_administrators a left join public.administrator_usage u on u.student_id=a.student_id
    and u.day=(now() at time zone 'Europe/Moscow')::date where a.student_id=auth.uid()
$$;

create or replace function public.award_nuts(student_ids uuid[], amount integer) returns void
language plpgsql security definer set search_path = '' as $$
declare count_ids integer; actor uuid:=auth.uid();
begin
  if not public.is_staff() then raise exception 'Только учитель или назначенный администратор может менять баллы.'; end if;
  if amount is null or amount=0 or abs(amount::bigint)>1000000 then raise exception 'Укажите ненулевое число баллов от -1000000 до 1000000.'; end if;
  if coalesce(cardinality(student_ids),0) not between 1 and 100 then raise exception 'Выберите от 1 до 100 учеников.'; end if;
  select count(distinct id) into count_ids from unnest(student_ids) as t(id);
  -- A shared roster lock also prevents role changes during a privileged mutation.
  perform pg_advisory_xact_lock(20261106,1);
  if (select count(*) from public.students where id=any(student_ids))<>count_ids then raise exception 'Список класса изменился. Обновите страницу.'; end if;
  if not public.is_teacher() and exists(select 1 from public.student_administrators where student_id=any(student_ids)) then
    raise exception 'Администратор не может менять свои результаты или результаты других администраторов.';
  end if;
  perform public.consume_administrator_quota(actor,'points',(abs(amount::bigint)*count_ids)::integer);
  if exists(select 1 from public.students where id=any(student_ids) and nuts::bigint+amount>1000000000) then raise exception 'Баланс не может превышать 1000000000.'; end if;
  with before as (select id,name,nuts from public.students where id=any(student_ids) order by id for update),
    changed as (update public.students s set nuts=greatest(0,s.nuts+amount) from before b where s.id=b.id returning s.id,s.name,s.nuts-b.nuts as delta)
  insert into public.classroom_activity(actor_id,actor_name,kind,student_id,student_name,amount)
    select actor,public.classroom_actor_name(actor),'points',id,name,delta from changed;
end $$;

create or replace function public.award_achievement(student_ids uuid[], achievement_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); inserted_count integer;
begin
  if not public.is_staff() then raise exception 'Только учитель или назначенный администратор может выдавать награды.'; end if;
  if achievement_title is null or length(btrim(achievement_title)) not between 1 and 300 then raise exception 'Название награды: от 1 до 300 символов.'; end if;
  if coalesce(cardinality(student_ids),0) not between 1 and 100 then raise exception 'Выберите от 1 до 100 учеников.'; end if;
  perform pg_advisory_xact_lock(20261106,1);
  if (select count(*) from public.students where id=any(student_ids))<>(select count(distinct id) from unnest(student_ids) t(id)) then raise exception 'Список класса изменился. Обновите страницу.'; end if;
  if not public.is_teacher() and exists(select 1 from public.student_administrators where student_id=any(student_ids)) then raise exception 'Администратор не может награждать себя или других администраторов.'; end if;
  with inserted as (insert into public.achievements(student_id,title)
    select id,btrim(achievement_title) from public.students where id=any(student_ids)
    on conflict(student_id,title) do nothing returning student_id,title)
  insert into public.classroom_activity(actor_id,actor_name,kind,student_id,student_name,title)
    select actor,public.classroom_actor_name(actor),'achievement',i.student_id,s.name,i.title from inserted i join public.students s on s.id=i.student_id;
  get diagnostics inserted_count = row_count;
  -- Raising rolls back both inserts and the log; duplicates do not spend quota.
  perform public.consume_administrator_quota(actor,'achievement',inserted_count);
end $$;

-- Service-only entry points receive the caller ID verified by auth.getUser in Edge.
create or replace function public.staff_provision_student(actor uuid, student_id uuid, student_name text, student_login text,
  initial_nuts integer default 0, initial_achievements jsonb default '[]'::jsonb, encrypted_password text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.teachers where user_id=actor) and
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
  if exists(select 1 from public.teachers where user_id=target_id) then raise exception 'Нельзя удалить преподавателя.'; end if;
  if not exists(select 1 from public.teachers where user_id=actor) and
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

revoke all on function public.classroom_actor_name(uuid),public.consume_administrator_quota(uuid,text,integer),
  public.staff_provision_student(uuid,uuid,text,text,integer,jsonb,text),public.staff_delete_student(uuid,uuid) from public,anon,authenticated;
grant execute on function public.staff_provision_student(uuid,uuid,text,text,integer,jsonb,text),public.staff_delete_student(uuid,uuid) to service_role;
revoke all on function public.is_staff(),public.configure_student_administrator(uuid,jsonb,boolean),public.my_administrator_quota(),
  public.award_nuts(uuid[],integer),public.award_achievement(uuid[],text) from public,anon,authenticated;
grant execute on function public.is_staff(),public.configure_student_administrator(uuid,jsonb,boolean),public.my_administrator_quota(),
  public.award_nuts(uuid[],integer),public.award_achievement(uuid[],text) to authenticated;
commit;
