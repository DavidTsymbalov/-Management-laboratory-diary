-- Owner-only, first CSA bootstrap. Never paste a password here.
-- Create csa@csa.management-laboratory.invalid in Authentication > Users first.
-- Replace the placeholder below with THAT account's exact Auth UUID.
begin;
do $$
declare
 target_text text := 'REPLACE_WITH_EXACT_AUTH_USER_UUID';
 target uuid;
begin
 if target_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
  raise exception 'Замените REPLACE_WITH_EXACT_AUTH_USER_UUID на UUID созданного аккаунта CSA.';
 end if;
 target:=target_text::uuid;
 perform pg_advisory_xact_lock(20261107,2);
 if not exists(select 1 from auth.users where id=target and email='csa@csa.management-laboratory.invalid') then
  raise exception 'UUID и технический адрес CSA не совпадают. Права не назначены.';
 end if;
 if exists(select 1 from public.csa_accounts where user_id<>target) then
  raise exception 'Первый CSA уже создан. Новых сотрудников создают из его кабинета.';
 end if;
 if exists(select 1 from public.students where id=target) or exists(select 1 from public.teachers where user_id=target) then
  raise exception 'Используйте отдельный аккаунт CSA.';
 end if;
 insert into public.csa_accounts(user_id,name) values(target,'CSA') on conflict do nothing;
 insert into public.staff_login_names(user_id,login) values(target,'csa') on conflict do nothing;
end $$;
commit;
select user_id,name from public.csa_accounts;
