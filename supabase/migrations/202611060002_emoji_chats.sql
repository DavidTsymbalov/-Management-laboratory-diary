-- Private pupil-to-pupil emoji conversations. Does not change scores or staff rights.
begin;
create table if not exists public.student_emoji_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.students(id) on delete cascade,
  recipient_id uuid not null references public.students(id) on delete cascade,
  emoji text not null check (emoji=any(array['💩','❤️','😂','🔥','👏','👻','🎉','⚡'])),
  client_nonce uuid not null,
  sent_at timestamptz not null default now(),
  check(sender_id<>recipient_id),
  unique(sender_id,client_nonce)
);
create index if not exists emoji_incoming on public.student_emoji_messages(recipient_id,id);
create index if not exists emoji_thread on public.student_emoji_messages(sender_id,recipient_id,id desc);
create index if not exists emoji_sender_time on public.student_emoji_messages(sender_id,sent_at desc);
create table if not exists public.student_emoji_reads (
  owner_id uuid not null references public.students(id) on delete cascade,
  peer_id uuid not null references public.students(id) on delete cascade,
  through_id bigint not null default 0 check(through_id>=0),
  primary key(owner_id,peer_id), check(owner_id<>peer_id)
);
create table if not exists public.student_emoji_blocks (
  owner_id uuid not null references public.students(id) on delete cascade,
  peer_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(owner_id,peer_id), check(owner_id<>peer_id)
);
alter table public.student_emoji_messages enable row level security;
alter table public.student_emoji_reads enable row level security;
alter table public.student_emoji_blocks enable row level security;
drop policy if exists emoji_participants on public.student_emoji_messages;
create policy emoji_participants on public.student_emoji_messages for select to authenticated
  using ((sender_id=(select auth.uid()) or recipient_id=(select auth.uid())) and not (select public.is_teacher())
    and exists(select 1 from public.students where id=(select auth.uid())));
drop policy if exists emoji_own_read_position on public.student_emoji_reads;
create policy emoji_own_read_position on public.student_emoji_reads for select to authenticated
  using(owner_id=(select auth.uid()) and not (select public.is_teacher()));
drop policy if exists emoji_own_block on public.student_emoji_blocks;
create policy emoji_own_block on public.student_emoji_blocks for select to authenticated
  using(owner_id=(select auth.uid()) and not (select public.is_teacher()));
revoke all on public.student_emoji_messages,public.student_emoji_reads,public.student_emoji_blocks from public,anon,authenticated;
grant select on public.student_emoji_messages,public.student_emoji_reads,public.student_emoji_blocks to authenticated;
grant all on public.student_emoji_messages,public.student_emoji_reads,public.student_emoji_blocks to service_role;
grant usage,select on sequence public.student_emoji_messages_id_seq to service_role;

create or replace function public.emoji_pupil_id() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or public.is_teacher() or not exists(select 1 from public.students where id=actor) then
    raise exception 'Эмодзи-чаты доступны только ученикам.';
  end if;
  return actor;
end $$;

create or replace function public.send_student_emoji(peer_id uuid, reaction text, request_id uuid) returns public.student_emoji_messages
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.emoji_pupil_id(); saved public.student_emoji_messages; last_sent timestamptz;
begin
  if peer_id is null or peer_id=actor or not exists(select 1 from public.students where id=peer_id)
    or exists(select 1 from public.teachers where user_id=peer_id) then raise exception 'Выберите другого ученика.'; end if;
  if request_id is null or reaction is null or not(reaction=any(array['💩','❤️','😂','🔥','👏','👻','🎉','⚡'])) then
    raise exception 'Выберите эмодзи из панели.';
  end if;
  -- Serialize bilateral block changes with each send.
  perform pg_advisory_xact_lock(20261106,2);
  select * into saved from public.student_emoji_messages where sender_id=actor and client_nonce=request_id;
  if found then
    if saved.recipient_id<>peer_id or saved.emoji<>reaction then raise exception 'Этот запрос уже использован.'; end if;
    return saved;
  end if;
  if exists(select 1 from public.student_emoji_blocks b where
    (b.owner_id=actor and b.peer_id=send_student_emoji.peer_id) or (b.owner_id=send_student_emoji.peer_id and b.peer_id=actor)) then
    raise exception 'Отправка этому ученику недоступна.';
  end if;
  select max(sent_at) into last_sent from public.student_emoji_messages where sender_id=actor;
  if last_sent is not null and clock_timestamp()-last_sent<interval '600 milliseconds' then raise exception 'Секунду — отправьте следующий эмодзи чуть позже.'; end if;
  if (select count(*) from public.student_emoji_messages where sender_id=actor and sent_at>now()-interval '1 minute')>=30 then
    raise exception 'Слишком много эмодзи подряд. Подождите минуту.';
  end if;
  if (select count(*) from public.student_emoji_messages where sender_id=actor and sent_at>=((now() at time zone 'Europe/Moscow')::date::timestamp at time zone 'Europe/Moscow'))>=500 then
    raise exception 'На сегодня достаточно эмодзи. Продолжите завтра.';
  end if;
  insert into public.student_emoji_messages(sender_id,recipient_id,emoji,client_nonce)
    values(actor,peer_id,reaction,request_id) returning * into saved;
  return saved;
end $$;

create or replace function public.student_emoji_thread(peer_id uuid, before_id bigint default null) returns setof public.student_emoji_messages
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.emoji_pupil_id();
begin
  if peer_id is null or peer_id=actor or not exists(select 1 from public.students where id=peer_id)
    or exists(select 1 from public.teachers where user_id=peer_id) then raise exception 'Выберите другого ученика.'; end if;
  return query select m.* from public.student_emoji_messages m
    where ((m.sender_id=actor and m.recipient_id=peer_id) or (m.sender_id=peer_id and m.recipient_id=actor))
      and (before_id is null or m.id<before_id) order by m.id desc limit 40;
end $$;

create or replace function public.mark_student_emoji_read(peer_id uuid, through_id bigint) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.emoji_pupil_id(); actual bigint;
begin
  if peer_id is null or peer_id=actor or not exists(select 1 from public.students where id=peer_id)
    or exists(select 1 from public.teachers where user_id=peer_id) then raise exception 'Выберите другого ученика.'; end if;
  select max(m.id) into actual from public.student_emoji_messages m
    where m.recipient_id=actor and m.sender_id=peer_id and m.id<=mark_student_emoji_read.through_id;
  if actual is null then return; end if;
  insert into public.student_emoji_reads(owner_id,peer_id,through_id) values(actor,peer_id,actual)
    on conflict on constraint student_emoji_reads_pkey do update set through_id=greatest(public.student_emoji_reads.through_id,excluded.through_id);
end $$;

create or replace function public.block_student_emojis(peer_id uuid, blocked boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.emoji_pupil_id();
begin
  if peer_id is null or peer_id=actor or not exists(select 1 from public.students where id=peer_id)
    or exists(select 1 from public.teachers where user_id=peer_id) then raise exception 'Выберите другого ученика.'; end if;
  if blocked is null then raise exception 'Выберите действие.'; end if;
  perform pg_advisory_xact_lock(20261106,2);
  if blocked then
    insert into public.student_emoji_blocks(owner_id,peer_id) values(actor,peer_id) on conflict do nothing;
  else delete from public.student_emoji_blocks b where b.owner_id=actor and b.peer_id=block_student_emojis.peer_id;
  end if;
end $$;

create or replace function public.student_emoji_state(after_message_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.emoji_pupil_id(); peers jsonb; incoming jsonb; cursor_value bigint;
begin
  select coalesce(jsonb_agg(to_jsonb(p) order by p.last_message_id desc nulls last,p.name),'[]'::jsonb) into peers from (
    select s.id,s.name,last_msg.emoji as last_emoji,last_msg.id as last_message_id,last_msg.sent_at as last_sent_at,
      exists(select 1 from public.student_emoji_blocks b where b.owner_id=actor and b.peer_id=s.id) as blocked,
      case when exists(select 1 from public.student_emoji_blocks b where b.owner_id=actor and b.peer_id=s.id) then 0 else
        (select count(*) from public.student_emoji_messages m where m.sender_id=s.id and m.recipient_id=actor
          and m.id>coalesce((select r.through_id from public.student_emoji_reads r where r.owner_id=actor and r.peer_id=s.id),0)) end as unread
    from public.students s left join lateral (select m.id,m.emoji,m.sent_at from public.student_emoji_messages m
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

revoke all on function public.emoji_pupil_id(),public.send_student_emoji(uuid,text,uuid),public.student_emoji_thread(uuid,bigint),
  public.mark_student_emoji_read(uuid,bigint),public.block_student_emojis(uuid,boolean),public.student_emoji_state(bigint) from public,anon,authenticated;
grant execute on function public.emoji_pupil_id(),public.send_student_emoji(uuid,text,uuid),public.student_emoji_thread(uuid,bigint),
  public.mark_student_emoji_read(uuid,bigint),public.block_student_emojis(uuid,boolean),public.student_emoji_state(bigint) to authenticated;

-- Realtime is optional: the UI also polls while visible when a socket is unavailable.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='student_emoji_messages') then
    alter publication supabase_realtime add table public.student_emoji_messages;
  end if;
end $$;
commit;
