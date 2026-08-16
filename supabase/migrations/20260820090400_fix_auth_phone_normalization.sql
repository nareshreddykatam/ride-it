create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_requested_role public.user_role_enum;
  v_role public.user_role_enum;
  v_vehicle_type public.vehicle_type_enum;
begin
  v_requested_role := (new.raw_user_meta_data ->> 'role')::public.user_role_enum;

  if new.phone is not null and new.phone <> '' then
    if v_requested_role = 'driver' then
      v_role := 'driver';
    else
      v_role := 'passenger';
    end if;
  elsif new.email is not null then
    v_role := 'admin';
  else
    v_role := 'passenger';
  end if;

  insert into public.users (id, role, phone, email, full_name)
  values (new.id, v_role, right(new.phone, 10), new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  if v_role = 'passenger' then
    insert into public.passengers (id) values (new.id)
    on conflict (id) do nothing;

    insert into public.passenger_ride_pins (passenger_id, pin_hash)
    values (new.id, crypt(public._generate_random_pin(), gen_salt('bf')))
    on conflict (passenger_id) do nothing;

  elsif v_role = 'driver' then
    v_vehicle_type := coalesce((new.raw_user_meta_data ->> 'vehicle_type')::public.vehicle_type_enum, 'auto');

    insert into public.drivers (id, vehicle_type)
    values (new.id, v_vehicle_type)
    on conflict (id) do nothing;

    insert into public.wallets (user_id, balance)
    values (new.id, 0)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;