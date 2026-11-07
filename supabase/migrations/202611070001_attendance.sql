-- Staff-only class register; historical names and marks survive pupil removal.
begin;
create table if not exists public.attendance_lessons (
  id uuid primary key default gen_random_uuid(),
  lesson_date date not null unique check(lesson_date between date '0001-01-01' and date '9999-12-31'),
  cancelled boolean not null default false,
  cancellation_reason text check(char_length(cancellation_reason)<=500),
  revision integer not null default 1 check(revision>0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.attendance_records (
  lesson_id uuid not null references public.attendance_lessons(id) on delete cascade,
  student_key uuid not null,
  student_name text not null,
  status text check(status in ('present','absent','late','excused')),
  revision integer not null default 1 check(revision>0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(lesson_id,student_key)
);
alter table public.attendance_lessons enable row level security;
alter table public.attendance_records enable row level security;
drop policy if exists attendance_staff_lessons on public.attendance_lessons;
create policy attendance_staff_lessons on public.attendance_lessons for select to authenticated using((select public.is_staff()));
drop policy if exists attendance_staff_records on public.attendance_records;
create policy attendance_staff_records on public.attendance_records for select to authenticated using((select public.is_staff()));
revoke all on public.attendance_lessons,public.attendance_records from public,anon,authenticated;
grant select on public.attendance_lessons,public.attendance_records to authenticated;
grant all on public.attendance_lessons,public.attendance_records to service_role;

alter table public.classroom_activity drop constraint if exists classroom_activity_kind_check;
alter table public.classroom_activity add constraint classroom_activity_kind_check check(kind in(
  'create','delete','points','achievement','admin_grant','admin_revoke','admin_limits',
  'homework_create','homework_edit','homework_archive','homework_restore',
  'lesson_create','lesson_cancel','lesson_restore','attendance_mark'
));

create or replace function public.create_attendance_lessons(lesson_dates date[]) returns setof public.attendance_lessons
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target_date date; saved public.attendance_lessons; inserted uuid; actor_name text;
begin
  if actor is null then raise exception 'Войдите в аккаунт.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if not public.is_staff() then raise exception 'Классный журнал доступен преподавателю и администратору.'; end if;
  if lesson_dates is null or cardinality(lesson_dates) not between 1 and 31 or array_position(lesson_dates,null) is not null then
    raise exception 'Выберите от 1 до 31 даты занятия.';
  end if;
  actor_name:=public.classroom_actor_name(actor);
  for target_date in select distinct d from unnest(lesson_dates) d order by d loop
    inserted:=null;
    insert into public.attendance_lessons(lesson_date,created_by,updated_by) values(target_date,actor,actor)
      on conflict(lesson_date) do nothing returning id into inserted;
    select * into saved from public.attendance_lessons where lesson_date=target_date;
    if inserted is not null then
      insert into public.attendance_records(lesson_id,student_key,student_name)
        select saved.id,s.id,s.name from public.students s;
      insert into public.classroom_activity(actor_id,actor_name,kind,student_name,title)
        values(actor,actor_name,'lesson_create','Весь класс',to_char(target_date,'DD.MM.YYYY'));
    end if;
    return next saved;
  end loop;
end $$;

create or replace function public.set_attendance_lesson_state(target_lesson uuid,make_cancelled boolean,reason text,expected_revision integer)
returns public.attendance_lessons language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved public.attendance_lessons; clean_reason text:=nullif(btrim(reason,E' \t\n\r'),''); actor_name text;
begin
  if actor is null then raise exception 'Войдите в аккаунт.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if not public.is_staff() then raise exception 'Классный журнал доступен преподавателю и администратору.'; end if;
  if make_cancelled is null or char_length(clean_reason)>500 then raise exception 'Причина отмены — до 500 символов.'; end if;
  if not make_cancelled then clean_reason:=null; end if;
  select * into saved from public.attendance_lessons where id=target_lesson for update;
  if not found then raise exception 'Занятие не найдено. Обновите журнал.'; end if;
  if saved.cancelled=make_cancelled and saved.cancellation_reason is not distinct from clean_reason then return saved; end if;
  if expected_revision is null or expected_revision<>saved.revision then raise exception 'Занятие уже изменилось. Обновите журнал.'; end if;
  actor_name:=public.classroom_actor_name(actor);
  update public.attendance_lessons set cancelled=make_cancelled,cancellation_reason=clean_reason,revision=revision+1,
    updated_by=actor,updated_at=clock_timestamp() where id=target_lesson returning * into saved;
  insert into public.classroom_activity(actor_id,actor_name,kind,student_name,title)
    values(actor,actor_name,case when make_cancelled then 'lesson_cancel' else 'lesson_restore' end,'Весь класс',
      to_char(saved.lesson_date,'DD.MM.YYYY')||case when clean_reason is not null then ': '||clean_reason else '' end);
  return saved;
end $$;

create or replace function public.save_attendance_marks(target_lesson uuid,lesson_revision integer,changes jsonb) returns setof public.attendance_records
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); lesson public.attendance_lessons; saved public.attendance_records; item jsonb;
  target_student uuid; target_status text; expected integer; snapshot_name text; changed integer:=0; actor_name text;
begin
  if actor is null then raise exception 'Войдите в аккаунт.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if not public.is_staff() then raise exception 'Классный журнал доступен преподавателю и администратору.'; end if;
  select * into lesson from public.attendance_lessons where id=target_lesson for update;
  if not found then raise exception 'Занятие не найдено. Обновите журнал.'; end if;
  if lesson.cancelled then raise exception 'Занятие отменено. Сначала восстановите его.'; end if;
  if lesson_revision is null or lesson_revision<>lesson.revision then raise exception 'Занятие уже изменилось. Обновите журнал.'; end if;
  if changes is null or jsonb_typeof(changes)<>'array' then raise exception 'Выберите отметки посещаемости.'; end if;
  if jsonb_array_length(changes) not between 1 and 1000 then raise exception 'Выберите от 1 до 1000 учеников.'; end if;
  if (select count(*) from jsonb_array_elements(changes))<>(select count(distinct lower(value->>'student_key')) from jsonb_array_elements(changes)) then
    raise exception 'Ученик указан несколько раз.';
  end if;
  for item in select value from jsonb_array_elements(changes) loop
    if jsonb_typeof(item)<>'object' or coalesce(item->>'student_key','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(item->>'expected_revision','')!~'^[0-9]{1,9}$' or not(item ? 'status') then raise exception 'Некорректная отметка. Обновите журнал.'; end if;
    target_student:=(item->>'student_key')::uuid; target_status:=item->>'status'; expected:=(item->>'expected_revision')::integer;
    if target_status is not null and target_status not in ('present','absent','late','excused') then raise exception 'Выберите отметку из списка.'; end if;
    select * into saved from public.attendance_records where lesson_id=target_lesson and student_key=target_student for update;
    if found then
      if saved.status is not distinct from target_status then return next saved; continue; end if;
      if saved.revision<>expected then raise exception 'Отметка уже изменена другим сотрудником. Обновите журнал.'; end if;
      update public.attendance_records set status=target_status,revision=revision+1,updated_by=actor,updated_at=clock_timestamp()
        where lesson_id=target_lesson and student_key=target_student returning * into saved;
    else
      select name into snapshot_name from public.students where id=target_student;
      if expected<>0 or snapshot_name is null then raise exception 'Ученик не найден. Обновите журнал.'; end if;
      insert into public.attendance_records(lesson_id,student_key,student_name,status,updated_by)
        values(target_lesson,target_student,snapshot_name,target_status,actor) returning * into saved;
    end if;
    changed:=changed+1;
    return next saved;
  end loop;
  if changed>0 then
    actor_name:=public.classroom_actor_name(actor);
    insert into public.classroom_activity(actor_id,actor_name,kind,student_name,title,amount)
      values(actor,actor_name,'attendance_mark','Весь класс',to_char(lesson.lesson_date,'DD.MM.YYYY'),changed);
  end if;
end $$;
create or replace function public.load_attendance_month(month_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare first_day date:=date_trunc('month',month_date)::date; lessons jsonb; records jsonb;
begin
  if not public.is_staff() then raise exception 'Классный журнал доступен преподавателю и администратору.'; end if;
  if month_date is null then raise exception 'Выберите месяц.'; end if;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.lesson_date),'[]'::jsonb) into lessons
    from public.attendance_lessons l where l.lesson_date>=first_day and l.lesson_date<first_day+interval '1 month';
  select coalesce(jsonb_agg(to_jsonb(r) order by r.lesson_id,r.student_key),'[]'::jsonb) into records
    from public.attendance_records r join public.attendance_lessons l on l.id=r.lesson_id
      where l.lesson_date>=first_day and l.lesson_date<first_day+interval '1 month';
  return jsonb_build_object('lessons',lessons,'records',records);
end $$;
revoke all on function public.load_attendance_month(date) from public,anon,authenticated;
grant execute on function public.load_attendance_month(date) to authenticated;

revoke all on function public.create_attendance_lessons(date[]),public.set_attendance_lesson_state(uuid,boolean,text,integer),public.save_attendance_marks(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.create_attendance_lessons(date[]),public.set_attendance_lesson_state(uuid,boolean,text,integer),public.save_attendance_marks(uuid,integer,jsonb) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='attendance_lessons') then
      alter publication supabase_realtime add table public.attendance_lessons;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='attendance_records') then
      alter publication supabase_realtime add table public.attendance_records;
    end if;
  end if;
end $$;
commit;
