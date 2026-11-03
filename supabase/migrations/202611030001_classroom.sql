begin;

create table public.teachers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200)
);

create table public.students (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  login_name text not null unique,
  nuts integer not null default 0 check (nuts between 0 and 1000000000),
  created_at timestamptz not null default now()
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  icon text not null default 'plus' check (icon in ('plus', 'bolt', 'cross')),
  earned_at timestamptz not null default now(),
  unique (student_id, title)
);

alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.achievements enable row level security;

create function public.is_teacher() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.teachers where user_id = auth.uid()) $$;

create policy teacher_self on public.teachers for select to authenticated
  using (user_id = (select auth.uid()));
create policy student_read on public.students for select to authenticated
  using (id = (select auth.uid()) or (select public.is_teacher()));
create policy achievement_read on public.achievements for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_teacher()));

-- Even a signed-in pupil cannot write tables or grant themselves teacher access.
revoke all on public.teachers, public.students, public.achievements from anon, authenticated;
grant select on public.teachers, public.students, public.achievements to authenticated;
grant all on public.teachers, public.students, public.achievements to service_role;

create function public.award_nuts(student_ids uuid[], amount integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_teacher() then raise exception 'Только учитель может менять баллы.'; end if;
  if amount is null or amount = 0 or abs(amount::bigint) > 1000000 then
    raise exception 'Укажите ненулевое число баллов от -1000000 до 1000000.';
  end if;
  if coalesce(cardinality(student_ids), 0) not between 1 and 100 then
    raise exception 'Выберите от 1 до 100 учеников.';
  end if;
  if (select count(*) from public.students where id = any(student_ids)) <>
     (select count(distinct id) from unnest(student_ids) as t(id)) then
    raise exception 'Список класса изменился. Обновите страницу.';
  end if;
  -- Increment in the database: concurrent awards cannot overwrite each other.
  update public.students set nuts = greatest(0, nuts + amount) where id = any(student_ids);
end $$;

create function public.award_achievement(student_ids uuid[], achievement_title text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_teacher() then raise exception 'Только учитель может выдавать ачивки.'; end if;
  if achievement_title is null or length(btrim(achievement_title)) not between 1 and 300 then
    raise exception 'Название ачивки: от 1 до 300 символов.';
  end if;
  if coalesce(cardinality(student_ids), 0) not between 1 and 100 then
    raise exception 'Выберите от 1 до 100 учеников.';
  end if;
  if (select count(*) from public.students where id = any(student_ids)) <>
     (select count(distinct id) from unnest(student_ids) as t(id)) then
    raise exception 'Список класса изменился. Обновите страницу.';
  end if;
  insert into public.achievements(student_id, title)
    select id, btrim(achievement_title) from public.students where id = any(student_ids)
    on conflict (student_id, title) do nothing;
end $$;

-- Students receive their rank, without downloading other pupils' names or data.
create function public.my_student_rank() returns table(rank bigint, total bigint)
language sql stable security definer set search_path = '' as $$
  select r.place, r.total from (
    select id, row_number() over(order by nuts desc, name, id) as place,
      count(*) over() as total from public.students
  ) r where r.id = auth.uid()
$$;

-- Only the verified Edge Function (service_role) may provision student records.
-- The row and imported achievements are committed together.
create function public.provision_student(
  student_id uuid, student_name text, student_login text,
  initial_nuts integer default 0, initial_achievements jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(initial_achievements) <> 'array' or jsonb_array_length(initial_achievements) > 500 then
    raise exception 'Некорректный список ачивок.';
  end if;
  insert into public.students(id, name, login_name, nuts)
    values(student_id, student_name, student_login, initial_nuts);
  insert into public.achievements(student_id, title, icon, earned_at)
    select provision_student.student_id, btrim(item->>'title'), coalesce(item->>'icon', 'plus'),
      coalesce((item->>'earnedAt')::timestamptz, now())
    from jsonb_array_elements(initial_achievements) item
    on conflict on constraint achievements_student_id_title_key do nothing;
end $$;

revoke all on function public.is_teacher() from public, anon;
revoke all on function public.award_nuts(uuid[], integer) from public, anon;
revoke all on function public.award_achievement(uuid[], text) from public, anon;
revoke all on function public.my_student_rank() from public, anon;
revoke all on function public.provision_student(uuid, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.is_teacher(), public.award_nuts(uuid[], integer),
  public.award_achievement(uuid[], text), public.my_student_rank() to authenticated;
grant execute on function public.provision_student(uuid, text, text, integer, jsonb) to service_role;

commit;
