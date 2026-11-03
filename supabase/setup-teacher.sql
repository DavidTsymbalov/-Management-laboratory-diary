-- Run after creating the Auth user with this technical identifier and your own password.
-- Website login: teacher. No real mailbox is required.
insert into public.teachers (user_id, name)
select id, 'Андрей Лякин'
from auth.users
where email = 't-1057a9604e04b274da5a4de0c8f4b4868d9b230989f8c8c6@teachers.management-laboratory.invalid'
on conflict (user_id) do update set name = excluded.name
returning user_id, name;
