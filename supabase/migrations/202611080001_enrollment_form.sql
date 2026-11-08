-- Public enrollment form; only a verified teacher or CSA can read submissions.
begin;

create table if not exists public.enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  telegram text not null unique check (telegram ~ '^[a-z][a-z0-9_]{4,31}$'),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists enrollment_requests_created on public.enrollment_requests(created_at desc, id desc);
alter table public.enrollment_requests enable row level security;
revoke all on public.enrollment_requests from public, anon, authenticated;
grant select on public.enrollment_requests to authenticated;
grant all on public.enrollment_requests to service_role;
drop policy if exists enrollment_teacher_read on public.enrollment_requests;
create policy enrollment_teacher_read on public.enrollment_requests for select to authenticated
  using ((select public.is_teacher()));
drop policy if exists security_live_session on public.enrollment_requests;
create policy security_live_session on public.enrollment_requests as restrictive to authenticated
  using ((select public.security_session_valid()));

create or replace function public.submit_enrollment_request(
  given_name text, family_name text, telegram_username text, website text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare
  cleaned_first text := btrim(regexp_replace(given_name, '[[:space:]]+', ' ', 'g'));
  cleaned_last text := btrim(regexp_replace(family_name, '[[:space:]]+', ' ', 'g'));
  cleaned_telegram text := lower(regexp_replace(regexp_replace(btrim(telegram_username), '^(https?://)?t[.]me/', '', 'i'), '^@', ''));
begin
  -- A honeypot supplements validation; it is not an authentication mechanism.
  if coalesce(website, '') <> '' then return; end if;
  if cleaned_first is null or char_length(cleaned_first) not between 1 and 80
    or cleaned_first !~ '[[:alpha:]]' or cleaned_first ~ '[[:cntrl:]<>]'
    or cleaned_last is null or char_length(cleaned_last) not between 1 and 80
    or cleaned_last !~ '[[:alpha:]]' or cleaned_last ~ '[[:cntrl:]<>]' then
    raise exception 'Введите имя и фамилию: до 80 символов в каждом поле.';
  end if;
  if cleaned_telegram is null or cleaned_telegram !~ '^[a-z][a-z0-9_]{4,31}$' then
    raise exception 'Укажите Telegram: от 5 до 32 символов, латинские буквы, цифры и подчёркивание; первый символ — буква.';
  end if;
  -- Retrying is safe. Never reveal, return or overwrite somebody else's entry.
  insert into public.enrollment_requests(first_name, last_name, telegram)
    values (cleaned_first, cleaned_last, cleaned_telegram)
    on conflict (telegram) do nothing;
end $$;

create or replace function public.list_enrollment_requests(query_text text default '', page_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare cleaned_query text := lower(btrim(coalesce(query_text, ''))); entries jsonb; total bigint;
begin
  if not public.is_teacher() then raise exception 'Заявки доступны только преподавателю и CSA.'; end if;
  if char_length(cleaned_query) > 100 or page_offset is null or page_offset not between 0 and 1000000 then
    raise exception 'Некорректные параметры поиска.';
  end if;
  select count(*) into total from public.enrollment_requests r
    where position(cleaned_query in lower(concat_ws(' ', r.first_name, r.last_name, r.telegram))) > 0;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc, item.id desc), '[]'::jsonb) into entries
    from (select r.id, r.first_name, r.last_name, r.telegram, r.created_at from public.enrollment_requests r
      where position(cleaned_query in lower(concat_ws(' ', r.first_name, r.last_name, r.telegram))) > 0
      order by r.created_at desc, r.id desc limit 100 offset page_offset) item;
  return jsonb_build_object('items', entries, 'total', total);
end $$;

revoke all on function public.submit_enrollment_request(text,text,text,text), public.list_enrollment_requests(text,integer)
  from public, anon, authenticated;
grant execute on function public.submit_enrollment_request(text,text,text,text) to anon, authenticated;
grant execute on function public.list_enrollment_requests(text,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
