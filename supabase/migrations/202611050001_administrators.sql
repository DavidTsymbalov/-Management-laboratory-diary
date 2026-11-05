-- Additive update for an existing classroom. Safe to run again; keeps every account and award.
begin;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  login_name text not null unique check (length(btrim(login_name)) between 1 and 200),
  created_by uuid references public.teachers(user_id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Keep is_teacher() strict: administrators can never grant another staff member access.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_teacher() or exists(select 1 from public.admins where user_id = auth.uid())
$$;

drop policy if exists admin_read on public.admins;
create policy admin_read on public.admins for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_teacher()));

drop policy if exists student_read on public.students;
create policy student_read on public.students for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));
drop policy if exists achievement_read on public.achievements;
create policy achievement_read on public.achievements for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()));

revoke all on public.admins from public, anon, authenticated;
grant select on public.admins to authenticated;
grant all on public.admins to service_role;

create or replace function public.award_nuts(student_ids uuid[], amount integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Только учитель или администратор может менять баллы.'; end if;
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
  update public.students set nuts = greatest(0, nuts + amount) where id = any(student_ids);
end $$;

create or replace function public.award_achievement(student_ids uuid[], achievement_title text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Только учитель или администратор может выдавать ачивки.'; end if;
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

-- The Edge Function authenticates the caller first. This routine also verifies the teacher
-- recorded as creator, and cannot be executed with a browser user's token.
create or replace function public.provision_administrator(
  administrator_id uuid, administrator_name text, administrator_login text, teacher_id uuid
) returns public.admins
language plpgsql security definer set search_path = '' as $$
declare saved public.admins;
begin
  if not exists(select 1 from public.teachers where user_id = teacher_id) then
    raise exception 'Только учитель может создавать администраторов.';
  end if;
  if exists(select 1 from public.teachers where user_id = administrator_id)
    or exists(select 1 from public.students where id = administrator_id) then
    raise exception 'Аккаунту уже назначена другая роль.';
  end if;
  insert into public.admins(user_id, name, login_name, created_by)
    values(administrator_id, btrim(administrator_name), administrator_login, teacher_id)
    returning * into saved;
  return saved;
end $$;

create or replace function public.provision_student(
  student_id uuid, student_name text, student_login text,
  initial_nuts integer default 0, initial_achievements jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.teachers where user_id = student_id)
    or exists(select 1 from public.admins where user_id = student_id) then
    raise exception 'Нельзя изменить аккаунт сотрудника.';
  end if;
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

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;
revoke all on function public.award_nuts(uuid[], integer), public.award_achievement(uuid[], text) from public, anon;
grant execute on function public.award_nuts(uuid[], integer), public.award_achievement(uuid[], text) to authenticated;
revoke all on function public.provision_administrator(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.provision_administrator(uuid, text, text, uuid) to service_role;
revoke all on function public.provision_student(uuid, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.provision_student(uuid, text, text, integer, jsonb) to service_role;

commit;
