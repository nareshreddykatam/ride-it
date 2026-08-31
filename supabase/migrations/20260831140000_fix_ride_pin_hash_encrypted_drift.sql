-- ============================================================================
-- 20260831140000_fix_ride_pin_hash_encrypted_drift.sql
--
-- REAL, LIVE-CONFIRMED BUG (not theoretical): a driver enters a passenger's
-- correct Ride PIN — the exact value the passenger sees via
-- get_my_ride_pin() (decrypted from passenger_ride_pins.pin_encrypted) —
-- and verify_ride_pin_and_start() rejects it. Root cause, confirmed
-- directly against the live table: passenger_ride_pins has stored TWO
-- independent representations of the same secret since 20260821090100
-- (pin_hash: bcrypt, one-way, used ONLY by verify_ride_pin_and_start();
-- pin_encrypted: Vault-key-reversible, used ONLY by get_my_ride_pin() for
-- passenger display) — set_ride_pin() writes both atomically from the
-- same plaintext on every call, so they stay in sync for that write path.
-- But nothing enforced that invariant against any OTHER write path (a
-- privileged/service-role direct SQL statement, for example — the kind
-- used for debugging/testing throughout this project's history, which
-- bypasses RLS by design and therefore bypasses no-direct-write
-- protection too). A live query against the current table found exactly
-- one row where pin_hash and the plaintext inside pin_encrypted disagree
-- — for that passenger, whatever they see on screen and tell their
-- driver can never pass verification, no matter how carefully it's
-- entered, because the two columns are checking against genuinely
-- different secrets.
--
-- This is an architecture problem, not a data-entry problem: two sources
-- of truth for one secret, with no mechanism keeping them consistent
-- beyond "one function happens to write both correctly." Fixed at the
-- schema level, not by patching the one row or changing the client.
--
-- FIX: pin_hash becomes a DERIVED value whenever pin_encrypted is present
-- — a BEFORE INSERT OR UPDATE trigger decrypts pin_encrypted (the
-- passenger-visible, reversible value — the one actually shown and
-- shared, so it must be the source of truth for repair) and recomputes
-- pin_hash from THAT plaintext, unconditionally overwriting whatever
-- pin_hash value was supplied. This makes it structurally impossible for
-- the two columns to ever disagree again for any row with pin_encrypted
-- set, regardless of which function or how privileged a caller writes to
-- this table — set_ride_pin() itself is untouched and keeps working
-- exactly as before (its own pin_hash computation becomes redundant but
-- harmless, since the trigger recomputes the same value from the same
-- plaintext immediately after).
--
-- The one-time UPDATE at the end forces this trigger to fire for every
-- existing row that has pin_encrypted, self-healing the drifted row using
-- ITS OWN already-stored, already-passenger-visible plaintext — never
-- inventing, resetting, or changing any passenger's actual PIN. Rows with
-- no pin_encrypted (pre-20260821090100 accounts that have never called
-- set_ride_pin() since) are correctly left untouched, exactly matching
-- that migration's own documented behavior for that case.
--
-- verify_ride_pin_and_start() itself is completely unchanged — it already
-- correctly derives the passenger to check from the ride's own
-- passenger_id (never client-supplied), already correctly scopes to the
-- calling driver's own assigned ride, and already correctly rejects a
-- wrong PIN without any state change. The ride -> driver -> passenger ->
-- PIN relationship was never the problem; the PIN VALUE being checked
-- against was wrong due to the drift above.
-- ============================================================================

create or replace function public._sync_ride_pin_hash()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_plaintext text;
begin
  if new.pin_encrypted is not null then
    v_key := public._get_ride_pin_encryption_key();
    v_plaintext := pgp_sym_decrypt(new.pin_encrypted, v_key);
    new.pin_hash := crypt(v_plaintext, gen_salt('bf'));
  end if;
  return new;
end;
$$;

revoke execute on function public._sync_ride_pin_hash() from public;
revoke execute on function public._sync_ride_pin_hash() from authenticated;

comment on function public._sync_ride_pin_hash() is
  'Keeps passenger_ride_pins.pin_hash mathematically derived from pin_encrypted whenever the latter is set, so the two can never silently drift apart again regardless of write path or caller privilege. pin_encrypted (the passenger-visible, reversible value) is treated as the source of truth for this derivation, since pin_hash cannot be reversed to check the opposite direction.';

drop trigger if exists sync_ride_pin_hash on public.passenger_ride_pins;
create trigger sync_ride_pin_hash
  before insert or update on public.passenger_ride_pins
  for each row execute function public._sync_ride_pin_hash();

-- One-time self-heal: forces the trigger above to fire for every existing
-- row that already has pin_encrypted, correcting any pin_hash that had
-- already drifted (confirmed exactly one such row on this project) using
-- that row's own existing, already-passenger-visible plaintext. A no-op
-- for rows where pin_hash already matched.
update public.passenger_ride_pins
set pin_encrypted = pin_encrypted
where pin_encrypted is not null;
