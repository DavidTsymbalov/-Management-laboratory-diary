-- CSA uses password-only login. MFA rules for all other roles stay unchanged.
begin;
create or replace function public.security_mfa_needed(actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when public.security_raw_role(actor)='csa' then false else
  exists(select 1 from public.security_account_state a where a.user_id=actor and a.mfa_required)
  or exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.status::text='verified' and f.factor_type::text='totp')
 end
$$;
revoke all on function public.security_mfa_needed(uuid) from public,anon,authenticated;

-- Remove factors already enrolled by CSA. Existing audit triggers record removals
-- and invalidate their old sessions; the next password login creates a fresh one.
delete from auth.mfa_factors where user_id in (select user_id from public.csa_accounts);
update public.security_account_state set mfa_required=false where user_id in (select user_id from public.csa_accounts);

do $$ declare account record;begin
 for account in select user_id,name from public.csa_accounts loop
  perform public.append_security_event(null,null,'csa_mfa_disabled',account.user_id,account.name,
   jsonb_build_object('login','password'), 'migration:202611070003:'||account.user_id::text);
 end loop;
end $$;
commit;
