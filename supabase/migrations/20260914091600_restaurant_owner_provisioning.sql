-- ============================================================================
-- 20260914091600_restaurant_owner_provisioning.sql
-- Ridora Food Phase 1.
--
-- Mirrors ensure_driver_profile()/ensure_passenger_profile()
-- (20260903093000) exactly, rather than touching handle_new_auth_user() —
-- that trigger has been amended by over a dozen migrations already and is
-- evidently one of the most fragile, load-bearing pieces of this schema;
-- the existing cross-role pattern already establishes "a self-only,
-- idempotent ensure_*_profile() RPC, called by the app right after
-- sign-up/login" as the correct way to add a new capability without
-- touching that trigger, and this follows the same path for
-- restaurant_owner. public.users.role is not the authorization signal for
-- any Food RLS policy (every restaurant policy checks restaurant_owners/
-- restaurants row existence directly) — exactly the same reasoning
-- 20260903093000 documents for passengers/drivers, so it is safe for this
-- function to never touch users.role at all.
-- ============================================================================

create or replace function public.ensure_restaurant_owner_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  insert into public.restaurant_owners (id)
  values (auth.uid())
  on conflict (id) do nothing;
end;
$$;

comment on function public.ensure_restaurant_owner_profile() is
  'Creates a public.restaurant_owners row for the calling user if one does not already exist. Idempotent, self-only (auth.uid()). Called by the Restaurant app immediately after sign-up/login, mirroring ensure_driver_profile()/ensure_passenger_profile().';

revoke all on function public.ensure_restaurant_owner_profile() from public;
grant execute on function public.ensure_restaurant_owner_profile() to authenticated;
