-- ============================================================================
-- 20260821090100_ride_pin_passenger_visibility.sql
--
-- REVISED — supersedes an earlier local-only draft of this same migration
-- that added a `pin_plaintext` column. That draft was never pushed to the
-- hosted project and is explicitly rejected: no plaintext Ride PIN column
-- exists anywhere in this migration, or has ever existed in the hosted
-- database.
--
-- Adds passenger-visibility for the EXISTING permanent Ride PIN using
-- REVERSIBLE ENCRYPTION (pgcrypto's pgp_sym_encrypt/pgp_sym_decrypt), not
-- plaintext storage. Does NOT create a new PIN mechanism, does NOT touch
-- verify_ride_pin_and_start() (still compares against pin_hash, bcrypt,
-- completely unchanged), and does NOT change how/when a PIN is generated
-- — it is still the passenger's one constant, permanent PIN.
--
-- KEY MANAGEMENT: the symmetric encryption key is generated once and
-- stored in Supabase Vault (the supabase_vault extension — confirmed
-- directly installed on this hosted project before writing this
-- migration, not assumed) as a single named secret,
-- `ride_pin_encryption_key`. It is:
--   - never stored in passenger_ride_pins itself (a separate table,
--     vault.secrets, entirely outside this schema's own tables),
--   - never hardcoded in this file or in application source,
--   - never returned by any function in this migration,
--   - only ever readable via vault.decrypted_secrets — confirmed directly
--     against this hosted project's actual grants: ONLY `postgres` and
--     `service_role` have SELECT on it; `authenticated` and `anon` have
--     NO grant at all. Every function below that touches the key is
--     SECURITY DEFINER, so it runs as the function's owner (postgres, per
--     how `supabase db push` creates these) — a client session can never
--     read vault.decrypted_secrets directly, only ever call the narrow,
--     auth.uid()-scoped RPC that uses it internally.
--
-- EXISTING USERS: pin_encrypted starts NULL for every current row — there
-- is no way to backfill it (the whole reason this migration exists is
-- that the original plaintext was never recoverable from pin_hash).
-- get_my_ride_pin() returns null (not an error) for these accounts; the
-- Passenger app shows a safe "set your PIN again to enable this" message
-- rather than an error. The moment any passenger next calls
-- set_ride_pin() (the existing "Change Ride PIN" flow, unchanged
-- trigger) for any reason, pin_encrypted is populated going forward.
-- ============================================================================

alter table public.passenger_ride_pins add column pin_encrypted bytea;

comment on column public.passenger_ride_pins.pin_encrypted is
  'pgp_sym_encrypt()-encrypted copy of the passenger''s current permanent Ride PIN, decryptable ONLY server-side by get_my_ride_pin() using a key held in Supabase Vault (never in this table, never in application code). Exists solely so the owning passenger can be shown their own PIN on the active-ride screen after a driver accepts -- pin_hash (bcrypt, one-way) remains the sole source of truth for verify_ride_pin_and_start(). NULL for any passenger who has not set/changed their PIN since this column was introduced.';

-- ----------------------------------------------------------------------------
-- One-time key provisioning. Idempotent (checks for an existing secret by
-- name first) so this migration can be safely re-applied to a fresh
-- database (e.g. a future local/shadow rebuild) without erroring or
-- rotating an already-issued key.
-- ----------------------------------------------------------------------------
do $$
declare
  v_existing_id uuid;
begin
  select id into v_existing_id from vault.decrypted_secrets where name = 'ride_pin_encryption_key';
  if v_existing_id is null then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ride_pin_encryption_key',
      'Symmetric key for encrypting/decrypting public.passenger_ride_pins.pin_encrypted. Introduced by 20260821090100. Never exposed to any client; read only inside SECURITY DEFINER functions owned by a role with vault.decrypted_secrets access (postgres/service_role).'
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- _get_ride_pin_encryption_key(): internal helper, never granted to any
-- client-facing role. Centralizes the one place this codebase ever reads
-- the Vault secret, so set_ride_pin() and get_my_ride_pin() share exactly
-- one lookup rather than duplicating the query.
-- ----------------------------------------------------------------------------
create or replace function public._get_ride_pin_encryption_key()
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'ride_pin_encryption_key';
  if v_key is null then
    raise exception 'Ride PIN encryption key is not provisioned' using errcode = 'XX000';
  end if;
  return v_key;
end;
$$;

revoke execute on function public._get_ride_pin_encryption_key() from public;
revoke execute on function public._get_ride_pin_encryption_key() from authenticated;
-- No grant to any client-facing role at all -- internal use only, exactly
-- like _mark_trusted_write() and _generate_random_pin() elsewhere in this
-- schema.

comment on function public._get_ride_pin_encryption_key() is
  'Internal only -- never grant EXECUTE to authenticated/anon. Reads the single Vault-held symmetric key used for passenger_ride_pins.pin_encrypted. Called only by set_ride_pin() and get_my_ride_pin(), both SECURITY DEFINER.';

-- ----------------------------------------------------------------------------
-- set_ride_pin(): unchanged hashing/storage for pin_hash. Now ALSO stores
-- pin_encrypted using the Vault-held key. Per explicit instruction, this
-- function no longer returns the plaintext PIN at all -- callers
-- (Profile's "Change Ride PIN" flow) now call get_my_ride_pin()
-- immediately afterward to display it, the SAME single retrieval path
-- used everywhere a PIN is ever shown, rather than a second, separate
-- return-value channel. The plaintext exists only transiently in this
-- function's own local variable, in server memory, for the duration of
-- one call -- never logged (no RAISE NOTICE/LOG of v_pin anywhere), never
-- returned to any caller from this function.
-- ----------------------------------------------------------------------------
drop function if exists public.set_ride_pin(text);

create or replace function public.set_ride_pin(p_new_pin text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin text;
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.passengers where id = auth.uid()) then
    raise exception 'Caller is not a registered passenger' using errcode = '42501';
  end if;

  v_pin := coalesce(p_new_pin, public._generate_random_pin());

  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'Ride PIN must be exactly 4 digits' using errcode = '22023';
  end if;

  v_key := public._get_ride_pin_encryption_key();

  insert into public.passenger_ride_pins (passenger_id, pin_hash, pin_encrypted, updated_at)
  values (auth.uid(), crypt(v_pin, gen_salt('bf')), pgp_sym_encrypt(v_pin, v_key), now())
  on conflict (passenger_id) do update set
    pin_hash = excluded.pin_hash,
    pin_encrypted = excluded.pin_encrypted,
    updated_at = now();
end;
$$;

comment on function public.set_ride_pin(text) is
  'Sole path for setting/changing a passenger''s Ride PIN. Stores a bcrypt hash (pin_hash, unchanged, used by verify_ride_pin_and_start()) AND a Vault-key-encrypted copy (pin_encrypted, used only by get_my_ride_pin() for passenger-facing display). Returns void -- callers must call get_my_ride_pin() to see the plaintext, the same single path used everywhere a PIN is ever displayed. Never returns or logs the plaintext itself.';

-- ----------------------------------------------------------------------------
-- get_my_ride_pin(): the sole read path for a passenger's own plaintext
-- PIN, for any reason (Profile's reveal-after-change, and the active-ride
-- screen after a driver accepts). Decrypts pin_encrypted using the
-- Vault-held key -- never accepts a key or a target id from the caller,
-- so it structurally cannot decrypt or return anyone else's PIN, and a
-- client cannot supply an arbitrary key to force a different decryption.
-- Returns null (not an error) if the caller has no pin_encrypted yet
-- (existing accounts predating this migration -- see header) -- the
-- Passenger app renders a safe "set your PIN again" message for this
-- case, never a crash, never a fallback to something less secure.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_ride_pin()
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_encrypted bytea;
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.passengers where id = auth.uid()) then
    raise exception 'Caller is not a registered passenger' using errcode = '42501';
  end if;

  select pin_encrypted into v_encrypted
  from public.passenger_ride_pins
  where passenger_id = auth.uid();

  if v_encrypted is null then
    return null;
  end if;

  v_key := public._get_ride_pin_encryption_key();
  return pgp_sym_decrypt(v_encrypted, v_key);
end;
$$;

comment on function public.get_my_ride_pin() is
  'Returns the CALLING passenger''s own current plaintext Ride PIN (decrypted server-side from pin_encrypted via the Vault-held key), or null if they have none yet (existing accounts predating this migration). Takes no parameters other than the caller''s own session -- structurally cannot return anyone else''s PIN, and cannot be pointed at a different key by the client. Intended callers: Profile''s "Change Ride PIN" reveal, and the Passenger app''s active-ride screen once a ride reaches accepted or later. A driver session can never call this successfully -- drivers are never registered in public.passengers, so the "Caller is not a registered passenger" check always rejects them, structurally, regardless of any other state.';

revoke execute on function public.get_my_ride_pin() from public;
grant execute on function public.get_my_ride_pin() to authenticated;
