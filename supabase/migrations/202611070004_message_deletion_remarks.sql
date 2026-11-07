-- Delete your own messages for both participants; teacher-only private remarks.
begin;
alter table public.student_emoji_messages add column if not exists deleted_at timestamptz;
alter table public.student_emoji_messages add column if not exists change_id bigint;
create sequence if not exists public.student_chat_changes_seq;
revoke all on sequence public.student_chat_changes_seq from public,anon,authenticated;
grant usage,select on sequence public.student_chat_changes_seq to service_role;
alter table public.student_emoji_messages drop constraint if exists student_chat_content_check;
alter table public.student_emoji_messages add constraint student_chat_content_check check(
 (deleted_at is not null and change_id is not null and emoji is null and body is null) or
 (deleted_at is null and change_id is null and ((emoji is not null and body is null) or
 (emoji is null and body is not null and char_length(btrim(body,E' \t\n\r')) between 1 and 2000)))
);
create index if not exists student_chat_changed on public.student_emoji_messages(change_id) where change_id is not null;

create or replace function public.delete_student_message(message_id bigint) returns public.student_emoji_messages
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.emoji_pupil_id(); saved public.student_emoji_messages; content_kind text;
begin
 perform pg_advisory_xact_lock(20261106,2);
 select * into saved from public.student_emoji_messages where id=message_id and sender_id=actor for update;
 if not found then raise exception 'Сообщение не найдено или не принадлежит вам.';end if;
 if saved.deleted_at is not null then return saved;end if;
 content_kind:=case when saved.emoji is null then 'text' else 'emoji' end;
 update public.student_emoji_messages set emoji=null,body=null,deleted_at=clock_timestamp(),change_id=nextval('public.student_chat_changes_seq') where id=saved.id returning * into saved;
 perform public.append_security_event(actor,public.security_session_id(),'chat_message_deleted',saved.recipient_id,public.classroom_actor_name(saved.recipient_id),jsonb_build_object('message_id',saved.id,'kind',content_kind));
 return saved;
end $$;

create or replace function public.student_chat_state(after_message_id bigint default null,after_change_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.emoji_pupil_id(); peers jsonb; incoming jsonb; cursor_value bigint; changes jsonb; change_cursor bigint;
begin
  select coalesce(jsonb_agg(to_jsonb(p) order by p.last_message_id desc nulls last,p.name),'[]'::jsonb) into peers from (
    select s.id,s.name,last_msg.emoji as last_emoji,last_msg.body as last_body,last_msg.id as last_message_id,last_msg.sent_at as last_sent_at,last_msg.deleted_at as last_deleted_at,
      exists(select 1 from public.student_emoji_blocks b where b.owner_id=actor and b.peer_id=s.id) as blocked,
      case when exists(select 1 from public.student_emoji_blocks b where b.owner_id=actor and b.peer_id=s.id) then 0 else
        (select count(*) from public.student_emoji_messages m where m.sender_id=s.id and m.recipient_id=actor
          and m.deleted_at is null and m.id>coalesce((select r.through_id from public.student_emoji_reads r where r.owner_id=actor and r.peer_id=s.id),0)) end as unread
    from public.students s left join lateral (select m.id,m.emoji,m.body,m.sent_at,m.deleted_at from public.student_emoji_messages m
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
  if after_change_id is null then
    changes:='[]'::jsonb;
    select coalesce(max(change_id),0) into change_cursor from public.student_emoji_messages where sender_id=actor or recipient_id=actor;
  else
    select coalesce(jsonb_agg(to_jsonb(m) order by m.change_id),'[]'::jsonb),coalesce(max(m.change_id),after_change_id) into changes,change_cursor
    from (select * from public.student_emoji_messages where (sender_id=actor or recipient_id=actor) and change_id>after_change_id order by change_id limit 100) m;
  end if;
  return jsonb_build_object('peers',peers,'incoming',incoming,'cursor',cursor_value,'changes',changes,'change_cursor',change_cursor);
end $$;

-- Keep the original endpoint compatible with already open clients.
create or replace function public.student_emoji_state(after_message_id bigint default null) returns jsonb
language sql stable security definer set search_path='' as $$select public.student_chat_state(after_message_id,null)$$;
revoke all on function public.delete_student_message(bigint),public.student_chat_state(bigint,bigint) from public,anon,authenticated;
grant execute on function public.delete_student_message(bigint),public.student_chat_state(bigint,bigint) to authenticated;

create table if not exists public.student_remarks(
 id uuid primary key,student_id uuid not null references public.students(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,author_name text not null,
 body text not null check(char_length(btrim(body,E' \t\n\r')) between 1 and 2000),
 created_at timestamptz not null default now(),dismissed_at timestamptz
);
create index if not exists student_remarks_recipient on public.student_remarks(student_id,created_at desc);
alter table public.student_remarks enable row level security;
revoke all on public.student_remarks from public,anon,authenticated;
grant select on public.student_remarks to authenticated;
grant all on public.student_remarks to service_role;
drop policy if exists remarks_read on public.student_remarks;
create policy remarks_read on public.student_remarks for select to authenticated using((select public.is_teacher()) or student_id=(select auth.uid()));
drop policy if exists security_live_session on public.student_remarks;
create policy security_live_session on public.student_remarks as restrictive to authenticated using((select public.security_session_valid())) with check((select public.security_session_valid()));

create or replace function public.send_student_remark(request_id uuid,target_student uuid,remark_body text) returns public.student_remarks
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved public.student_remarks; cleaned text:=btrim(replace(remark_body,E'\r\n',E'\n'),E' \t\n\r');
begin
 if not public.is_teacher() then raise exception 'Замечания отправляет только преподаватель или CSA.';end if;
 if request_id is null or target_student is null or cleaned is null or char_length(cleaned) not between 1 and 2000 then raise exception 'Выберите ученика и введите текст до 2000 символов.';end if;
 if not exists(select 1 from public.students where id=target_student) then raise exception 'Ученик не найден.';end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,3));
 select * into saved from public.student_remarks where id=request_id;
 if found then
  if saved.author_id=actor and saved.student_id=target_student and saved.body=cleaned then return saved;end if;
  raise exception 'Этот запрос уже использован.';
 end if;
 insert into public.student_remarks(id,student_id,author_id,author_name,body) values(request_id,target_student,actor,public.classroom_actor_name(actor),cleaned) returning * into saved;
 perform public.append_security_event(actor,public.security_session_id(),'remark_sent',target_student,public.classroom_actor_name(target_student),jsonb_build_object('remark_id',saved.id));
 return saved;
end $$;
create or replace function public.dismiss_student_remark(remark_id uuid) returns public.student_remarks
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.emoji_pupil_id(); saved public.student_remarks;
begin
 select * into saved from public.student_remarks where id=remark_id and student_id=actor for update;
 if not found then raise exception 'Замечание не найдено.';end if;
 if saved.dismissed_at is not null then return saved;end if;
 update public.student_remarks set dismissed_at=clock_timestamp() where id=saved.id returning * into saved;
 perform public.append_security_event(actor,public.security_session_id(),'remark_dismissed',actor,public.classroom_actor_name(actor),jsonb_build_object('remark_id',saved.id));
 return saved;
end $$;
revoke all on function public.send_student_remark(uuid,uuid,text),public.dismiss_student_remark(uuid) from public,anon,authenticated;
grant execute on function public.send_student_remark(uuid,uuid,text),public.dismiss_student_remark(uuid) to authenticated;

-- Live changes are optional; both views also refresh while visible.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='student_remarks') then
  alter publication supabase_realtime add table public.student_remarks;
 end if;
end $$;
commit;
