-- ============================================================================
-- 20260806090500_provision_driver_wallet.sql
-- handle_new_auth_user() (Phase 4, amended in Phase 4.5) creates a
-- passengers or drivers row but never a wallets row for either — nothing
-- in Phase 4/4.5 needed one yet. Phase 6's Wallet screen does. Extending
-- the same trigger (not writing a second, separate one) keeps all
-- "what happens when a new auth user is created" logic in one place.
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role_enum;
  v_vehicle_type public.vehicle_type_enum;
begin
  v_role := (new.raw_user_meta_data ->> 'role')::public.user_role_enum;

  if v_role is null then
    if new.phone is not null and new.phone <> '' then
      v_role := 'passenger';
    elsif new.email is not null then
      v_role := 'admin';
    else
      v_role := 'passenger';
    end if;
  end if;

  insert into public.users (id, role, phone, email, full_name)
  values (
    new.id,
    v_role,
    new.phone,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;

  if v_role = 'passenger' then
    insert into public.passengers (id) values (new.id)
    on conflict (id) do nothing;

  elsif v_role = 'driver' then
    v_vehicle_type := coalesce((new.raw_user_meta_data ->> 'vehicle_type')::public.vehicle_type_enum, 'auto');
    insert into public.drivers (id, vehicle_type) values (new.id, v_vehicle_type)
    on conflict (id) do nothing;

    -- New this migration: every driver gets a wallet from day one. The
    -- wallets table is intentionally keyed to users (not drivers) per
    -- Phase 3's design, so extending this to passengers later (promo
    -- credit, refunds) needs no schema change — just another insert here.
    insert into public.wallets (user_id, balance) values (new.id, 0)
    on conflict (user_id) do nothing;

  end if;

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Provisions the matching public.users(+passengers/drivers/wallet) row on new auth.users insert. Role: explicit user_metadata.role first, else inferred from phone-vs-email presence. Drivers additionally get a zero-balance wallet (Phase 6). Admin accounts still require a manually-created admin_users row — not handled here.';
