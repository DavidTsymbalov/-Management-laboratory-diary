-- Lesson materials share dates with attendance; attendance marks remain staff-only.
begin;
create table if not exists public.lesson_content (
  lesson_id uuid primary key references public.attendance_lessons(id) on delete cascade,
  title text not null check(char_length(btrim(title)) between 1 and 120),
  body text not null default '' check(char_length(body)<=6000),
  homework text not null default '' check(char_length(homework)<=6000),
  homework_due date,
  published boolean not null default true,
  revision integer not null default 1 check(revision>0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.lesson_presentations (
  id uuid primary key,
  lesson_id uuid not null references public.lesson_content(lesson_id) on delete cascade,
  position integer not null check(position between 0 and 9),
  title text not null check(char_length(btrim(title)) between 1 and 180),
  kind text not null check(kind in ('file','link')),
  url text,
  storage_path text unique,
  file_name text,
  mime_type text,
  size_bytes bigint,
  check((kind='link' and url is not null and storage_path is null and mime_type is null and size_bytes is null)
    or (kind='file' and url is null and storage_path is not null and file_name is not null
      and mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation')
      and size_bytes between 1 and 26214400))
);
alter table public.lesson_content enable row level security;
alter table public.lesson_presentations enable row level security;

create or replace function public.lesson_member() returns boolean language sql stable security definer set search_path='' as $$
 select public.security_session_valid() and (public.is_teacher() or exists(select 1 from public.students where id=auth.uid()))
$$;
drop policy if exists lesson_content_read on public.lesson_content;
create policy lesson_content_read on public.lesson_content for select to authenticated using(
  public.lesson_member() and (published or public.is_teacher())
);
drop policy if exists lesson_presentations_read on public.lesson_presentations;
create policy lesson_presentations_read on public.lesson_presentations for select to authenticated using(
  public.lesson_member() and exists(select 1 from public.lesson_content c where c.lesson_id=lesson_presentations.lesson_id and (c.published or public.is_teacher()))
);
revoke all on public.lesson_content,public.lesson_presentations from public,anon,authenticated;
grant select on public.lesson_content,public.lesson_presentations to authenticated;
grant all on public.lesson_content,public.lesson_presentations to service_role;

-- A private bucket: there are no permanent public download links.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('lesson-presentations','lesson-presentations',false,26214400,
   array['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.lesson_file_visible(object_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.lesson_member() and (public.is_teacher() or exists(
   select 1 from public.lesson_presentations p join public.lesson_content c on c.lesson_id=p.lesson_id
   where p.storage_path=object_path and c.published))
$$;
create or replace function public.lesson_file_unattached(object_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_teacher() and not exists(select 1 from public.lesson_presentations where storage_path=object_path)
$$;
drop policy if exists lesson_files_read on storage.objects;
create policy lesson_files_read on storage.objects for select to authenticated using(
 bucket_id='lesson-presentations' and public.lesson_file_visible(name)
);
drop policy if exists lesson_files_upload on storage.objects;
create policy lesson_files_upload on storage.objects for insert to authenticated with check(
 bucket_id='lesson-presentations' and public.is_teacher()
 and name ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}\.(pdf|pptx)$')
);
drop policy if exists lesson_files_remove on storage.objects;
create policy lesson_files_remove on storage.objects for delete to authenticated using(
 bucket_id='lesson-presentations' and public.lesson_file_unattached(name)
);

create or replace function public.list_classroom_lessons(month_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.lesson_member() then raise exception 'Войдите в аккаунт участника класса.'; end if;
 if month_date is null then raise exception 'Выберите месяц.'; end if;
 return coalesce((select jsonb_agg(to_jsonb(item) order by item.lesson_date desc) from (
   select l.id,l.lesson_date,l.cancelled,l.cancellation_reason,
     coalesce(c.title,'Занятие') as title,coalesce(c.body,'') as body,coalesce(c.homework,'') as homework,
     c.homework_due,coalesce(c.published,false) as published,coalesce(c.revision,0) as revision,c.updated_at,
     coalesce((select jsonb_agg(to_jsonb(p) order by p.position) from public.lesson_presentations p where p.lesson_id=l.id),'[]'::jsonb) as presentations
   from public.attendance_lessons l left join public.lesson_content c on c.lesson_id=l.id
   where l.lesson_date>=date_trunc('month',month_date)::date
     and l.lesson_date<(date_trunc('month',month_date)+interval '1 month')::date
     and (public.is_teacher() or c.published)
 ) item),'[]'::jsonb);
end $$;

create or replace function public.save_lesson_materials(
 target_date date,lesson_title text,lesson_body text,lesson_homework text,homework_due date,
 make_published boolean,expected_revision integer,presentations jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); lesson public.attendance_lessons; saved public.lesson_content;
 clean_title text:=btrim(lesson_title,E' \t\n\r'); clean_body text:=btrim(replace(coalesce(lesson_body,''),E'\r\n',E'\n'),E' \t\n\r');
 clean_homework text:=btrim(replace(coalesce(lesson_homework,''),E'\r\n',E'\n'),E' \t\n\r'); item jsonb; pos integer:=0;
 object_path text; object_meta jsonb; attachment_id uuid; previous_paths text[]; seen_ids uuid[]:='{}'; file_type text;
begin
 if not public.is_teacher() then raise exception 'Материалы добавляет только преподаватель.'; end if;
 if target_date is null or clean_title is null or char_length(clean_title) not between 1 and 120
   or char_length(clean_body)>6000 or char_length(clean_homework)>6000 or make_published is null
   or expected_revision is null or expected_revision<0 then raise exception 'Проверьте дату, тему и текст занятия.'; end if;
 if jsonb_typeof(presentations) is distinct from 'array' then raise exception 'Проверьте список презентаций.'; end if;
 if jsonb_array_length(presentations)>10 then raise exception 'К занятию можно прикрепить до 10 презентаций.'; end if;
 if homework_due is not null and homework_due<target_date then raise exception 'Срок ДЗ не может быть раньше занятия.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_date::text,20261112));
 select * into lesson from public.create_attendance_lessons(array[target_date]);
 select * into saved from public.lesson_content where lesson_id=lesson.id for update;
 if coalesce(saved.revision,0)<>expected_revision then raise exception 'Материалы уже изменились. Обновите список и откройте занятие заново.'; end if;
 select coalesce(array_agg(storage_path) filter(where storage_path is not null),'{}') into previous_paths
   from public.lesson_presentations where lesson_id=lesson.id;
 -- Validate the entire replacement before touching the published attachment list.
 for item in select value from jsonb_array_elements(presentations) loop
   if jsonb_typeof(item) is distinct from 'object' or char_length(btrim(coalesce(item->>'title',''))) not between 1 and 180
     or coalesce(item->>'kind','') not in ('file','link') or item->>'id' is null then raise exception 'Укажите название каждой презентации.'; end if;
   attachment_id:=(item->>'id')::uuid;
   if attachment_id=any(seen_ids) or exists(select 1 from public.lesson_presentations where id=attachment_id and lesson_id<>lesson.id) then
     raise exception 'Презентация уже используется. Добавьте её заново.'; end if;
   seen_ids:=array_append(seen_ids,attachment_id);
   if item->>'kind'='link' then
     if char_length(coalesce(item->>'url',''))>2048 or coalesce(item->>'url','') !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]+)?([/?#][^[:space:]]*)?$' then
       raise exception 'Вставьте полную ссылку на презентацию, начинающуюся с https://.'; end if;
   else
     object_path:=item->>'storage_path';file_type:=item->>'mime_type';
     if object_path is null or (not(object_path=any(previous_paths)) and object_path !~ ('^'||actor::text||'/[0-9a-f-]{36}\.(pdf|pptx)$'))
       or coalesce(file_type,'') not in ('application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation')
       or char_length(coalesce(item->>'file_name','')) not between 1 and 180 then raise exception 'Загрузите файл презентации заново.'; end if;
     select metadata into object_meta from storage.objects where bucket_id='lesson-presentations' and name=object_path;
     if not found or object_meta->>'mimetype' is distinct from file_type or (object_meta->>'size')::bigint is distinct from (item->>'size_bytes')::bigint
       or (item->>'size_bytes')::bigint not between 1 and 26214400 then raise exception 'Файл не загружен или превышает 25 МБ.'; end if;
     if exists(select 1 from public.lesson_presentations where storage_path=object_path and lesson_id<>lesson.id) then
       raise exception 'Этот файл уже прикреплён к другому занятию.'; end if;
   end if;
 end loop;
 insert into public.lesson_content(lesson_id,title,body,homework,homework_due,published,updated_by)
 values(lesson.id,clean_title,clean_body,clean_homework,homework_due,make_published,actor)
 on conflict(lesson_id) do update set title=excluded.title,body=excluded.body,homework=excluded.homework,
   homework_due=excluded.homework_due,published=excluded.published,updated_by=actor,
   revision=public.lesson_content.revision+1,updated_at=clock_timestamp();
 delete from public.lesson_presentations where lesson_id=lesson.id;
 for item in select value from jsonb_array_elements(presentations) loop
   insert into public.lesson_presentations(id,lesson_id,position,title,kind,url,storage_path,file_name,mime_type,size_bytes)
   values((item->>'id')::uuid,lesson.id,pos,btrim(item->>'title'),item->>'kind',
     case when item->>'kind'='link' then item->>'url' end,
     case when item->>'kind'='file' then item->>'storage_path' end,
     case when item->>'kind'='file' then item->>'file_name' end,
     case when item->>'kind'='file' then item->>'mime_type' end,
     case when item->>'kind'='file' then (item->>'size_bytes')::bigint end);
   pos:=pos+1;
 end loop;
 perform public.append_security_event(actor,public.security_session_id(),'lesson_materials_save',lesson.id,clean_title,
   jsonb_build_object('lesson_date',target_date,'published',make_published,'presentations',pos));
 return lesson.id;
end $$;
revoke all on function public.lesson_member(),public.lesson_file_visible(text),public.lesson_file_unattached(text),public.list_classroom_lessons(date),public.save_lesson_materials(date,text,text,text,date,boolean,integer,jsonb) from public,anon,authenticated;
grant execute on function public.lesson_member(),public.lesson_file_visible(text),public.lesson_file_unattached(text),public.list_classroom_lessons(date),public.save_lesson_materials(date,text,text,text,date,boolean,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
