-- Phase 1 adversarial audit — fixes for defects reproduced against the live
-- hosted project. Each section names the defect it closes and cites the
-- reproduction. Nothing here relaxes an existing control; every change is a
-- tightening, or (section 4) a correction to a control that was rejecting
-- legitimate drivers.

-- =====================================================================
-- 1. AUDIT-001 / AUDIT-004  Payment capture was reachable from a browser
-- =====================================================================
-- Reproduced: an authenticated driver called create_pending_subscription_
-- payment('daily') then mark_subscription_payment_captured(<id>,'pay_FAKE')
-- over /rest/v1/rpc and received an ACTIVE ₹49 subscription with
-- provider_order_id NULL — no Razorpay order, no charge, no signature.
-- The same shape applied to a passenger's online ride payment via
-- mark_ride_payment_captured(), setting rides.payment_status='paid'.
--
-- Root cause: the "mark captured" step is the point at which money is
-- asserted to have moved. Razorpay signature verification lives in the
-- Next.js Route Handlers and in the webhook — but the RPCs those handlers
-- call were also granted to `authenticated`, so a client could call them
-- directly and skip the only thing that establishes payment actually
-- happened. Capture/failure marking is a server-side step; it has no
-- legitimate caller holding a user session.

-- 1a. A stale two-argument overload left behind by 20260825090000 still
-- existed with DEFAULT privileges (EXECUTE TO PUBLIC), so it was callable
-- even by `anon`, and — unlike the three-argument version — it did not bind
-- the capture to the provider order id at all.
DROP FUNCTION IF EXISTS public.mark_subscription_payment_captured(uuid, text);

-- 1b. Capture/failure marking becomes service-role-only. The Route Handlers
-- (apps/passenger/app/api/payments/verify, apps/driver/app/api/payments/
-- subscription/verify) call these with the service-role client AFTER
-- verifying the gateway signature and after re-checking, with the caller's
-- own RLS-scoped session, that the payment belongs to them.
REVOKE EXECUTE ON FUNCTION public.mark_ride_payment_captured(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_ride_payment_failed(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_subscription_payment_captured(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_subscription_payment_failed(uuid, text, text) FROM authenticated;

-- 1c. attach_*_order stays callable by the owning user (it only records the
-- order id the server just created for their own payment), but a gateway
-- order id must now back at most one payment row. Without this, a client
-- could attach someone else's real order id to their own pending payment
-- and have that order's webhook capture the wrong row.
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_unique
  ON public.payments (provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_provider_order_unique
  ON public.subscription_payments (provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

-- =====================================================================
-- 2. AUDIT-002  A passenger could assign any driver to their own ride
-- =====================================================================
-- Reproduced: PATCH /rest/v1/rides?id=eq.<own ride> with
-- {"driver_id":"<any driver>","status":"accepted"} returned 200. The
-- passenger then read that driver's name, phone, plate
-- (get_matched_driver_contact), live GPS (get_ride_tracking) and full
-- drivers row, sent them chat messages, and pinned them as "busy" so
-- _find_eligible_drivers excluded them from all matching. The victim never
-- received an offer and never consented.
--
-- Also reproduced: the assigned driver could PATCH status directly to
-- 'rated' / 'payment' / 'otp_verified' / 'driver_arriving' / 'accepted',
-- abandoning a live ride into a terminal state with no strike, no
-- passenger notification and no re-matching.
--
-- Root cause: rides_update_passenger / rides_update_driver grant row-level
-- UPDATE, and the existing protect_ride_* triggers only guard financial
-- columns, ratings, and four of the twelve statuses. driver_id was only
-- protected once the ride was already fare-final.
--
-- Fix: no direct client write may change status or driver_id at all. Every
-- legitimate transition already goes through a SECURITY DEFINER RPC
-- (accept_ride_offer, cancel_ride_by_driver, passenger_cancel_*,
-- mark_driver_arriving, verify_ride_pin_and_start, driver_mark_arrived_at_
-- destination, driver_confirm_payment_received, complete_ride,
-- submit_rating, dispatch_next_batch) or through an admin.
--
-- The guard is SECURITY INVOKER on purpose: inside a SECURITY DEFINER RPC
-- current_user is the function owner (postgres), while a direct PostgREST
-- write runs as `authenticated`. That distinction is what lets this admit
-- every RPC path without editing ten functions to set a marker GUC, and it
-- cannot be spoofed from a client.
CREATE OR REPLACE FUNCTION public.protect_ride_assignment_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
begin
  -- Not a direct end-user write: a SECURITY DEFINER lifecycle RPC
  -- (current_user = the function owner) or a service-role/back-office
  -- context. Those are the sanctioned paths.
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- Admins reassign a ride's driver from the Admin console as a plain
  -- client update (packages/data/src/admin.ts) — still allowed.
  if public.is_admin() then
    return new;
  end if;

  if new.driver_id is distinct from old.driver_id then
    raise exception
      'A ride''s driver cannot be set directly — assignment happens only through accept_ride_offer()'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    raise exception
      'A ride''s status cannot be set directly — use the ride lifecycle RPCs'
      using errcode = '42501';
  end if;

  -- AUDIT-012 (second half). rides_update_driver / rides_update_passenger
  -- grant row-level UPDATE, so without this BOTH the driver and the
  -- passenger could simply PATCH the Ride PIN attempt counter back to zero
  -- and clear the lockout. Verified against production before this line
  -- existed: both roles got HTTP 200 doing exactly that. Attempt state has
  -- to be as server-authoritative as the verification itself, or the
  -- lockout in verify_ride_pin_and_start() is decorative.
  if new.pin_attempt_count is distinct from old.pin_attempt_count
     or new.pin_locked_until is distinct from old.pin_locked_until then
    raise exception
      'Ride PIN attempt state is server-managed — it cannot be set directly'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

DROP TRIGGER IF EXISTS protect_ride_assignment_columns ON public.rides;
CREATE TRIGGER protect_ride_assignment_columns
BEFORE UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.protect_ride_assignment_columns();

-- =====================================================================
-- 3. AUDIT-003  Duplicate concurrent rides for one passenger
-- =====================================================================
-- Reproduced: two ride-creation requests fired simultaneously (a double-tap
-- on Confirm) both returned 201. Both rides then dispatched offers and
-- consumed drivers for a passenger who can only take one.
--
-- Mirrors the existing "one active ride per driver" rule that
-- accept_ride_offer() and _find_eligible_drivers() already enforce.
-- Deliberately excludes ride_completed / payment / rated / cancelled so a
-- passenger with an unpaid finished ride can still book again.
CREATE UNIQUE INDEX IF NOT EXISTS rides_one_active_per_passenger
  ON public.rides (passenger_id)
  WHERE status IN (
    'requested', 'matched', 'accepted', 'driver_arriving',
    'otp_verified', 'ride_started', 'destination_reached', 'payment_collected'
  );

-- =====================================================================
-- 4. AUDIT-005  A stationary driver silently stopped being matchable
-- =====================================================================
-- Reproduced end to end: an online, approved, subscribed, idle driver
-- parked exactly at the pickup point sent six heartbeat pings over 120s;
-- location_updated_at never advanced; dispatch_next_batch() returned 0
-- offers. The same driver moved 33 m, re-pinged, and immediately received
-- an offer.
--
-- Root cause: this trigger refreshed location_updated_at only when the
-- COORDINATES changed, and watchDriverLocation() only writes at all after
-- 25 m of movement. Freshness therefore meant "recently moved", while
-- _find_eligible_drivers() reads it as "app is alive and reporting" — so
-- the single most available driver state (parked and waiting) aged out of
-- the matching pool after driver_location_freshness_seconds.
--
-- Fix: a client may now signal a heartbeat by including location_updated_at
-- in the write. The trigger still never trusts the submitted value — it
-- always overwrites it with now() — so the server-authoritative guarantee
-- from 20260813090500 is fully preserved. Updates that do not touch
-- location at all (going offline, changing UPI details) still leave the
-- timestamp alone.
CREATE OR REPLACE FUNCTION public.set_driver_location_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if new.current_location is distinct from old.current_location
     or new.location_updated_at is distinct from old.location_updated_at then
    new.location_updated_at = now();
  else
    new.location_updated_at = old.location_updated_at;
  end if;
  return new;
end;
$$;

-- 4b. AUDIT-009  Implausible GPS jumps were accepted verbatim.
-- Reproduced: mid-ride, a driver's location was moved Vijayawada -> Delhi
-- (1,390 km) in a single ping and the passenger's live tracking followed it.
-- Rejects a fix only when ALL THREE hold: the previous fix is under five
-- minutes old (so a driver who was offline or idle re-anchors freely), the
-- implied ground speed exceeds the same 200 km/h ceiling
-- update_driver_speed() already enforces, and the jump is further than
-- MIN_PLAUSIBLE_JUMP_KM.
--
-- That last condition is not belt-and-braces, it is load-bearing: elapsed
-- time here is the gap between two WRITES, not between two GPS fixes. Two
-- writes landing a second apart (a retried ping, or the Dashboard's 20s
-- ping immediately followed by the Navigation screen's 5s one) compress the
-- denominator and make an utterly ordinary 120 m of movement look like
-- 400 km/h. Caught by the regression suite when a legitimate 123 m move was
-- rejected. Requiring a large ABSOLUTE distance too means no in-city
-- movement can ever trip this no matter how the writes are spaced, while a
-- cross-country jump still cannot get through.
CREATE OR REPLACE FUNCTION public.reject_implausible_driver_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
declare
  v_elapsed_seconds numeric;
  v_metres numeric;
  v_kmh numeric;
  v_max_kmh constant numeric := 200;
  v_min_jump_km constant numeric := 2;
begin
  if new.current_location is null
     or old.current_location is null
     or old.location_updated_at is null
     or new.current_location is not distinct from old.current_location then
    return new;
  end if;

  v_elapsed_seconds := extract(epoch from (now() - old.location_updated_at));
  if v_elapsed_seconds <= 0 or v_elapsed_seconds > 300 then
    return new;   -- stale anchor: allow a clean re-anchor
  end if;

  v_metres := ST_Distance(old.current_location, new.current_location);
  if v_metres / 1000.0 <= v_min_jump_km then
    return new;
  end if;

  v_kmh := (v_metres / 1000.0) / (v_elapsed_seconds / 3600.0);

  if v_kmh > v_max_kmh then
    raise exception
      'Implausible location update: % km in % s (% km/h)',
      round(v_metres / 1000.0, 1), round(v_elapsed_seconds), round(v_kmh)
      using errcode = '22003';
  end if;

  return new;
end;
$$;

DROP TRIGGER IF EXISTS reject_implausible_driver_location ON public.drivers;
CREATE TRIGGER reject_implausible_driver_location
BEFORE UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.reject_implausible_driver_location();

-- =====================================================================
-- 5. AUDIT-012  The Ride PIN was brute-forceable
-- =====================================================================
-- Reproduced: the assigned driver submitted 11 wrong PINs in 534 ms
-- (~21/s) with no lockout, no counter and no error. A 4-digit PIN is the
-- only control proving the passenger is actually present at pickup.
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS pin_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz;

COMMENT ON COLUMN public.rides.pin_attempt_count IS
  'Consecutive failed Ride PIN attempts for this ride. Reset to 0 on a successful verification. Written only by verify_ride_pin_and_start().';
COMMENT ON COLUMN public.rides.pin_locked_until IS
  'Set when pin_attempt_count reaches the lockout threshold; verify_ride_pin_and_start() refuses attempts until this passes.';

CREATE OR REPLACE FUNCTION public.verify_ride_pin_and_start(p_ride_id uuid, p_entered_pin text)
RETURNS rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
declare
  v_ride public.rides;
  v_pin_hash text;
  v_max_attempts constant integer := 5;
  v_lockout constant interval := interval '15 minutes';
  v_matches boolean;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.driver_id is distinct from auth.uid() then
    raise exception 'Caller is not the assigned driver for this ride' using errcode = '42501';
  end if;

  if v_ride.status is distinct from 'driver_arriving' then
    raise exception 'Ride is not awaiting Ride PIN verification' using errcode = 'P0001';
  end if;

  -- Checked BEFORE the hash comparison, so a locked-out driver cannot keep
  -- probing, and so even a correct PIN is refused while the lockout stands.
  if v_ride.pin_locked_until is not null and v_ride.pin_locked_until > now() then
    raise exception
      'Too many incorrect Ride PIN attempts. Try again in % seconds, or ask the passenger to confirm their PIN.',
      greatest(1, ceil(extract(epoch from (v_ride.pin_locked_until - now()))))
      using errcode = 'P0001';
  end if;

  select pin_hash into v_pin_hash
  from public.passenger_ride_pins
  where passenger_id = v_ride.passenger_id;

  if v_pin_hash is null then
    raise exception 'No Ride PIN configured for this passenger' using errcode = 'P0001';
  end if;

  v_matches := crypt(p_entered_pin, v_pin_hash) = v_pin_hash;

  if not v_matches then
    -- Counting happens here, inside the SECURITY DEFINER function, so it
    -- cannot be skipped by calling from a different session, a different
    -- browser, or the RPC directly -- the counter lives on the ride row,
    -- not in any client state. protect_ride_assignment_columns() (section 2)
    -- stops either participant from patching it back down.
    perform public._mark_trusted_write();

    update public.rides
    set pin_attempt_count = coalesce(pin_attempt_count, 0) + 1,
        pin_locked_until = case
          when coalesce(pin_attempt_count, 0) + 1 >= v_max_attempts then now() + v_lockout
          else pin_locked_until
        end
    where id = p_ride_id;

    insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
    values (
      p_ride_id, 'ride_pin_failed', 'driver', auth.uid(),
      jsonb_build_object('attempt', coalesce(v_ride.pin_attempt_count, 0) + 1, 'max_attempts', v_max_attempts)
    );

    return null;
  end if;

  perform public._mark_trusted_write();

  update public.rides
  set status = 'ride_started',
      started_at = now(),
      pin_verified_at = now(),
      pin_attempt_count = 0,
      pin_locked_until = null
  where id = p_ride_id
    and driver_id = auth.uid()
    and status = 'driver_arriving'
  returning * into v_ride;

  if v_ride.id is not null then
    insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
    values (p_ride_id, 'ride_pin_verified', 'driver', auth.uid(), jsonb_build_object('verified_at', v_ride.pin_verified_at));
  end if;

  return v_ride;
end;
$$;

-- =====================================================================
-- 6. AUDIT-007  dispatch_next_batch() had no caller authorization
-- =====================================================================
-- Reproduced against production: a second passenger AND an unrelated driver
-- each called dispatch_next_batch(<a stranger's ride id>) and got HTTP 200.
-- advance_ride_matching() has scoped the ride to passenger_id = auth.uid()
-- since 20260907093000, but dispatch_next_batch() was separately granted to
-- `authenticated` and checked nothing at all. Sustained, that lets anyone
-- push another passenger's ride past matching_max_batches, which cancels it.
--
-- Fix: remove the door rather than add a second lock. dispatch_next_batch()
-- is an internal step of matching, not an API. Revoking EXECUTE from every
-- client role leaves exactly one authorized entry point --
-- advance_ride_matching(), which already enforces ownership and reaches
-- this function as its SECURITY DEFINER owner (postgres), unaffected by the
-- revoke. This is strictly stronger than an in-function ownership check:
-- there is now no client role that can invoke it at all, for any ride,
-- including the ride's own passenger.
--
-- The one client call site, startMatching() in packages/data/src/matching.ts,
-- now calls advance_ride_matching() instead. On a freshly created ride that
-- has no live offer, advance_ride_matching() dispatches a batch immediately,
-- which is exactly the behaviour startMatching() existed to trigger.
REVOKE EXECUTE ON FUNCTION public.dispatch_next_batch(uuid) FROM authenticated;

COMMENT ON FUNCTION public.dispatch_next_batch(uuid) IS
  'Internal matching step. NOT client-callable (AUDIT-007). advance_ride_matching() is the only client entry point into matching and it scopes the ride to passenger_id = auth.uid(); it reaches this function as its SECURITY DEFINER owner.';

-- =====================================================================
-- 7. AUDIT-008  A subscription bought for one vehicle type unlocked another
-- =====================================================================
-- drivers.vehicle_type is deliberately driver-editable (switching vehicles
-- is a legitimate action — upsertActiveVehicle() mirrors it), but nothing
-- re-checked that the active subscription was bought for the vehicle type
-- now being driven. subscription_plans is keyed on (vehicle_type, plan)
-- precisely so tiers can be priced differently, so this is a live bypass
-- the moment those prices diverge. Both the go-online gate and matching
-- eligibility now require the match.
CREATE OR REPLACE FUNCTION public.enforce_driver_online_requires_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if new.is_online = true
     and (coalesce(old.is_online, false) = false
          or new.vehicle_type is distinct from old.vehicle_type) then
    if new.verification_status != 'approved' then
      raise exception 'Cannot go online — driver verification is not approved' using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from public.subscriptions
      where driver_id = new.id
        and status = 'active'
        and expires_at > now()
        and vehicle_type = new.vehicle_type
    ) then
      raise exception 'Cannot go online without an active subscription for this vehicle type' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public._find_eligible_drivers(p_ride_id uuid, p_batch_size integer)
RETURNS TABLE(driver_id uuid, distance_meters double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  select
    d.id as driver_id,
    ST_Distance(d.current_location, r.pickup_location) as distance_meters
  from public.rides r
  join public.drivers d
    on d.vehicle_type = r.vehicle_type
   and d.is_online = true
   and d.verification_status = 'approved'
   and d.current_location is not null
   and d.location_updated_at is not null
   and d.location_updated_at > now() - (public._get_matching_setting_int('driver_location_freshness_seconds', 120) || ' seconds')::interval
   and (r.city_id is null or d.current_city_id = r.city_id)
  where r.id = p_ride_id
    and exists (
      select 1 from public.subscriptions s
      where s.driver_id = d.id
        and s.status = 'active'
        and s.expires_at > now()
        and s.vehicle_type = d.vehicle_type
    )
    and not exists (
      select 1 from public.rides r2
      where r2.driver_id = d.id and r2.status not in ('ride_completed', 'cancelled', 'rated')
    )
    and not exists (
      select 1 from public.ride_offers o
      where o.ride_id = r.id and o.driver_id = d.id
    )
  order by d.current_location <-> r.pickup_location
  limit p_batch_size;
$$;

-- =====================================================================
-- 8. Hygiene: _calculate_fare() is an internal helper, not a public API.
-- =====================================================================
-- It had DEFAULT privileges (EXECUTE TO PUBLIC), so `anon` could call it.
-- get_fare_quote() and compute_ride_fare() are both SECURITY DEFINER owned
-- by postgres and keep working unchanged.
REVOKE EXECUTE ON FUNCTION public._calculate_fare(
  public.vehicle_type_enum, uuid, extensions.geography, extensions.geography, numeric
) FROM PUBLIC;

-- =====================================================================
-- 9. AUDIT-011  A driver cancelling after acceptance stranded the ride
-- =====================================================================
-- cancel_ride_by_driver() (20260831075359) deliberately returns the SAME
-- ride to 'requested' so matching finds a replacement, and the passenger
-- is told "Finding you another driver". Reproduced: that re-match then
-- found NOBODY, while three drivers sat online, idle, approved,
-- subscribed and parked at the pickup point.
--
--   A. fresh ride, before any offers go out   -> 3 eligible
--   B. driver cancelled, ride back in matching -> 0 eligible
--      (online_idle_nearby = 3 in both cases)
--
-- Root cause: the "don't re-offer to this driver" clause keyed on the mere
-- EXISTENCE of a ride_offers row, regardless of its status. After batch 1,
-- every driver in it holds a row — including the ones marked 'superseded',
-- who never declined anything; accept_ride_offer() marks them superseded
-- purely because someone else won the race. Those drivers were then locked
-- out of the ride permanently. Where batch 1 covered the available drivers
-- (matching_batch_size is 3 — routine in a pilot market), the ride could
-- never be re-matched at all: the passenger waits out
-- matching_minimum_search_seconds and gets "No drivers available".
--
-- Fix: only a driver who actually made or missed a decision is excluded —
-- 'pending' (already holds a live offer), 'rejected' (declined),
-- 'expired' (let it lapse) or 'accepted' (had it, including the one who
-- just cancelled). 'superseded' no longer locks anyone out.
CREATE OR REPLACE FUNCTION public._find_eligible_drivers(p_ride_id uuid, p_batch_size integer)
RETURNS TABLE(driver_id uuid, distance_meters double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  select
    d.id as driver_id,
    ST_Distance(d.current_location, r.pickup_location) as distance_meters
  from public.rides r
  join public.drivers d
    on d.vehicle_type = r.vehicle_type
   and d.is_online = true
   and d.verification_status = 'approved'
   and d.current_location is not null
   and d.location_updated_at is not null
   and d.location_updated_at > now() - (public._get_matching_setting_int('driver_location_freshness_seconds', 120) || ' seconds')::interval
   and (r.city_id is null or d.current_city_id = r.city_id)
  where r.id = p_ride_id
    and exists (
      select 1 from public.subscriptions s
      where s.driver_id = d.id
        and s.status = 'active'
        and s.expires_at > now()
        and s.vehicle_type = d.vehicle_type
    )
    and not exists (
      select 1 from public.rides r2
      where r2.driver_id = d.id and r2.status not in ('ride_completed', 'cancelled', 'rated')
    )
    and not exists (
      select 1 from public.ride_offers o
      where o.ride_id = r.id
        and o.driver_id = d.id
        and o.status <> 'superseded'
    )
  order by d.current_location <-> r.pickup_location
  limit p_batch_size;
$$;
