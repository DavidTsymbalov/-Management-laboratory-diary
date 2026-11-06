-- Add homework and text messages without replacing existing chats or results.
begin;

alter table public.student_emoji_messages alter column emoji drop not null;
alter table public.student_emoji_messages add column if not exists body text;
alter table public.student_emoji_messages drop constraint if exists student_chat_content_check;
alter table public.student_emoji_messages add constraint student_chat_content_check check (
  (emoji is not null and body is null) or
  (emoji is null and body is not null and char_length(btrim(body,E' \t\n\r')) between 1 and 2000)
);

-- Shared delivery path: emoji and text obey the same privacy, nonce and rate limits.
create or replace function public.deliver_student_chat(peer_id uuid,reaction text,message_body text,request_id uuid)
returns public.student_emoji_messages language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.emoji_pupil_id(); saved public.student_emoji_messages; last_sent timestamptz;
  cleaned text:=btrim(replace(message_body,E'\r\n',E'\n'),E' \t\n\r');
begin
  if peer_id is null or peer_id=actor or not exists(select 1 from public.students where id=peer_id)
    or exists(select 1 from public.teachers where user_id=peer_id) then raise exception 'Выберите другого ученика.'; end if;
  if request_id is null then raise exception 'Не удалось подготовить отправку. Повторите попытку.'; end if;
  if reaction is not null then
    if message_body is not null or not(reaction=any(array['💩','❤️','😂','🔥','👏','👻','🎉','⚡'])) then raise exception 'Выберите эмодзи из панели.'; end if;
  elsif cleaned is null or char_length(cleaned) not between 1 and 2000 then
    raise exception 'Сообщение должно содержать от 1 до 2000 символов.';
  end if;
  perform pg_advisory_xact_lock(20261106,2);
  select * into saved from public.student_emoji_messages where sender_id=actor and client_nonce=request_id;
  if found then
    if saved.recipient_id<>peer_id or saved.emoji is distinct from reaction or saved.body is distinct from cleaned then
      raise exception 'Этот запрос уже использован.';
    end if;
    return saved;
  end if;
  if exists(select 1 from public.student_emoji_blocks b where
    (b.owner_id=actor and b.peer_id=deliver_student_chat.peer_id) or (b.owner_id=deliver_student_chat.peer_id and b.peer_id=actor)) then
    raise exception 'Отправка этому ученику недоступна.';
  end if;
  select max(sent_at) into last_sent from public.student_emoji_messages where sender_id=actor;
  if last_sent is not null and clock_timestamp()-last_sent<interval '600 milliseconds' then raise exception 'Секунду — отправьте следующее сообщение чуть позже.'; end if;
  if (select count(*) from public.student_emoji_messages where sender_id=actor and sent_at>now()-interval '1 minute')>=30 then
    raise exception 'Слишком много сообщений подряд. Подождите минуту.';
  end if;
  if (select count(*) from public.student_emoji_messages where sender_id=actor and sent_at>=((now() at time zone 'Europe/Moscow')::date::timestamp at time zone 'Europe/Moscow'))>=500 then
    raise exception 'На сегодня достаточно сообщений. Продолжите завтра.';
  end if;
  insert into public.student_emoji_messages(sender_id,recipient_id,emoji,body,client_nonce)
    values(actor,peer_id,reaction,cleaned,request_id) returning * into saved;
  return saved;
end $$;
create or replace function public.send_student_emoji(peer_id uuid,reaction text,request_id uuid) returns public.student_emoji_messages
language plpgsql security definer set search_path='' as $$
begin
  if reaction is null then raise exception 'Выберите эмодзи из панели.'; end if;
  return public.deliver_student_chat(peer_id,reaction,null,request_id);
end $$;
create or replace function public.send_student_message(peer_id uuid,message_body text,request_id uuid) returns public.student_emoji_messages
language plpgsql security definer set search_path='' as $$
begin return public.deliver_student_chat(peer_id,null,message_body,request_id); end $$;
revoke all on function public.deliver_student_chat(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.send_student_message(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.send_student_message(uuid,text,uuid) to authenticated;

create or replace function public.student_emoji_state(after_message_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.emoji_pupil_id(); peers jsonb; incoming jsonb; cursor_value bigint;
begin
  select coalesce(jsonb_agg(to_jsonb(p) order by p.last_message_id desc nulls last,p.name),'[]'::jsonb) into peers from (
    select s.id,s.name,last_msg.emoji as last_emoji,last_msg.body as last_body,last_msg.id as last_message_id,last_msg.sent_at as last_sent_at,
      exists(select 1 from public.student_emoji_blocks b where b.owner_id=actor and b.peer_id=s.id) as blocked,
      case when exists(select 1 from public.student_emoji_blocks b where b.owner_id=actor and b.peer_id=s.id) then 0 else
        (select count(*) from public.student_emoji_messages m where m.sender_id=s.id and m.recipient_id=actor
          and m.id>coalesce((select r.through_id from public.student_emoji_reads r where r.owner_id=actor and r.peer_id=s.id),0)) end as unread
    from public.students s left join lateral (select m.id,m.emoji,m.body,m.sent_at from public.student_emoji_messages m
      where (m.sender_id=actor and m.recipient_id=s.id) or (m.sender_id=s.id and m.recipient_id=actor)
      order by m.id desc limit 1) last_msg on true
    where s.id<>actor and not exists(select 1 from public.teachers t where t.user_id=s.id)
  ) p;
  if after_message_id is null then
    incoming:='[]'::jsonb;
    select coalesce(max(id),0) into cursor_value from public.student_emoji_messages where recipient_id=actor;
  else
    select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb),coalesce(max(m.id),after_message_id)
      into incoming,cursor_value from (select * from public.student_emoji_messages where recipient_id=actor and id>after_message_id order by id limit 50) m;
  end if;
  return jsonb_build_object('peers',peers,'incoming',incoming,'cursor',cursor_value);
end $$;


create table if not exists public.classroom_homework (
  id uuid primary key,
  title text not null check(char_length(btrim(title)) between 1 and 120),
  body text not null check(char_length(btrim(body,E' \t\n\r')) between 1 and 6000),
  due_date date,
  archived boolean not null default false,
  revision integer not null default 1 check(revision>0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  author_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists classroom_homework_current on public.classroom_homework(archived,due_date,created_at desc);
alter table public.classroom_homework enable row level security;
drop policy if exists homework_members_read on public.classroom_homework;
create policy homework_members_read on public.classroom_homework for select to authenticated using(
  (select public.is_staff()) or exists(select 1 from public.students where id=(select auth.uid()))
);
revoke all on public.classroom_homework from public,anon,authenticated;
grant select on public.classroom_homework to authenticated;
grant all on public.classroom_homework to service_role;

alter table public.classroom_activity drop constraint if exists classroom_activity_kind_check;
alter table public.classroom_activity add constraint classroom_activity_kind_check check(kind in(
  'create','delete','points','achievement','admin_grant','admin_revoke','admin_limits','homework_create','homework_edit','homework_archive','homework_restore'
));

create or replace function public.save_classroom_homework(homework_id uuid,homework_title text,homework_body text,homework_due date,expected_revision integer)
returns public.classroom_homework language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved public.classroom_homework; actor_name text; operation text;
  clean_title text:=btrim(homework_title,E' \t\n\r'); clean_body text:=btrim(replace(homework_body,E'\r\n',E'\n'),E' \t\n\r');
begin
  if actor is null then raise exception 'Войдите в аккаунт.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if not public.is_staff() then raise exception 'Публиковать ДЗ может только преподаватель или администратор.'; end if;
  if homework_id is null or expected_revision is null or expected_revision<0 then raise exception 'Обновите список заданий и повторите попытку.'; end if;
  if clean_title is null or char_length(clean_title) not between 1 and 120 then raise exception 'Название задания — от 1 до 120 символов.'; end if;
  if clean_body is null or char_length(clean_body) not between 1 and 6000 then raise exception 'Текст задания — от 1 до 6000 символов.'; end if;
  actor_name:=public.classroom_actor_name(actor);
  -- Serialize creation retries as well as edits of the same assignment.
  perform pg_advisory_xact_lock(hashtextextended(homework_id::text,1));
  select * into saved from public.classroom_homework where id=homework_id for update;
  if expected_revision=0 then
    if found then
      if saved.created_by=actor and saved.title=clean_title and saved.body=clean_body and saved.due_date is not distinct from homework_due then return saved; end if;
      raise exception 'Задание уже изменилось. Обновите список.';
    end if;
    insert into public.classroom_homework(id,title,body,due_date,created_by,updated_by,author_name)
      values(homework_id,clean_title,clean_body,homework_due,actor,actor,actor_name) returning * into saved;
    operation:='homework_create';
  else
    if not found or saved.revision<>expected_revision then raise exception 'Задание уже изменилось. Обновите список и откройте его заново.'; end if;
    update public.classroom_homework set title=clean_title,body=clean_body,due_date=homework_due,
      revision=revision+1,updated_by=actor,author_name=actor_name,updated_at=clock_timestamp()
      where id=homework_id returning * into saved;
    operation:='homework_edit';
  end if;
  insert into public.classroom_activity(actor_id,actor_name,kind,student_name,title)
    values(actor,actor_name,operation,'Весь класс',saved.title);
  return saved;
end $$;

create or replace function public.archive_classroom_homework(homework_id uuid,make_archived boolean,expected_revision integer)
returns public.classroom_homework language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved public.classroom_homework; actor_name text;
begin
  if actor is null then raise exception 'Войдите в аккаунт.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if not public.is_staff() then raise exception 'Менять ДЗ может только преподаватель или администратор.'; end if;
  if make_archived is null then raise exception 'Выберите действие.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(homework_id::text,1));
  select * into saved from public.classroom_homework where id=homework_id for update;
  if not found or saved.revision<>expected_revision or expected_revision is null then raise exception 'Задание уже изменилось. Обновите список и откройте его заново.'; end if;
  if saved.archived=make_archived then return saved; end if;
  actor_name:=public.classroom_actor_name(actor);
  update public.classroom_homework set archived=make_archived,revision=revision+1,updated_by=actor,author_name=actor_name,updated_at=clock_timestamp()
    where id=homework_id returning * into saved;
  insert into public.classroom_activity(actor_id,actor_name,kind,student_name,title)
    values(actor,actor_name,case when make_archived then 'homework_archive' else 'homework_restore' end,'Весь класс',saved.title);
  return saved;
end $$;
revoke all on function public.save_classroom_homework(uuid,text,text,date,integer),public.archive_classroom_homework(uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.save_classroom_homework(uuid,text,text,date,integer),public.archive_classroom_homework(uuid,boolean,integer) to authenticated;

-- Homework also works through visible-page polling if Realtime is unavailable.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='classroom_homework') then
    alter publication supabase_realtime add table public.classroom_homework;
  end if;
end $$;
commit;
