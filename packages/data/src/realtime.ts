import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * supabase.channel(topic) returns an EXISTING channel object if one with the
 * exact same topic is already registered on this client, rather than always
 * creating a fresh one -- see @supabase/realtime-js's RealtimeClient.channel()
 * ("If a channel with the same topic already exists it will be returned
 * instead of creating a duplicate connection"). This is documented,
 * intentional de-duplication in the library, not a bug there.
 *
 * Every subscribeTo*() helper in this package uses a deterministic, reusable
 * topic (e.g. `ride:${rideId}`). If a previous subscription to that same
 * topic is still registered on the client when a new one is set up -- e.g.
 * a component remount before the previous cleanup's removeChannel() call has
 * actually finished (removeChannel is asynchronous) -- `.channel(topic)`
 * hands back that ALREADY-SUBSCRIBED channel object, and calling `.on()` on
 * it throws synchronously:
 *   "cannot add `postgres_changes` callbacks ... after `subscribe()`."
 * That throw was uncaught anywhere in the call chain, crashing the entire
 * page to the nearest error boundary -- reproduced live on the Passenger
 * app's Matching screen (2026-09-07), whose crash report this fixes.
 *
 * Removing any stale channel for the same topic FIRST guarantees
 * `.channel()` always starts from a clean, not-yet-subscribed instance --
 * this fixes the actual precondition for the crash, it does not catch or
 * hide the exception.
 */
export function freshChannel(supabase: SupabaseClient, topic: string) {
  const realtimeTopic = `realtime:${topic}`;
  const existing = supabase.getChannels().find((c) => c.topic === realtimeTopic);
  if (existing) supabase.removeChannel(existing);
  return supabase.channel(topic);
}
