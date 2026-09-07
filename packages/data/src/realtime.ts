import type { SupabaseClient } from "@supabase/supabase-js";

// Per-tab, monotonically increasing -- guarantees every freshChannel() call
// this client ever makes gets a topic string no earlier or later call could
// ever have used, without needing a random source.
let channelSequence = 0;

/**
 * supabase.channel(topic) returns an EXISTING channel object if one with the
 * exact same topic is already registered on this client, rather than always
 * creating a fresh one -- see @supabase/realtime-js's RealtimeClient.channel()
 * ("If a channel with the same topic already exists it will be returned
 * instead of creating a duplicate connection"). This is documented,
 * intentional de-duplication in the library, not a bug there.
 *
 * An earlier version of this helper tried to defeat that reuse by calling
 * supabase.removeChannel(existing) (un-awaited) right before supabase.channel
 * (topic) -- that does NOT work, and was found to still be broken during a
 * follow-up audit (2026-09-07), for two compounding reasons verified by
 * reading @supabase/realtime-js's and the underlying @supabase/phoenix
 * package's own source:
 *
 *   1. removeChannel() is asynchronous, and the channel is only actually
 *      spliced out of the client's internal `channels` array later, via an
 *      async `close` event callback -- NOT synchronously, and not even by
 *      the time removeChannel()'s own returned Promise resolves in every
 *      case. An un-awaited call has default zero chance of completing
 *      before the very next (synchronous) line runs.
 *   2. A Phoenix channel object can only ever be joined ONCE, permanently
 *      (`joinedOnce`, set on the underlying @supabase/phoenix Channel and
 *      never reset). So even in the cases where the old fix APPEARED to
 *      work (its removeChannel() call's synchronous leave()-triggered state
 *      change happens to satisfy .on()'s state check), the very next
 *      .subscribe() call on that SAME reused object unconditionally throws
 *      a second, different, equally uncaught error: "tried to join multiple
 *      times. 'join' can only be called a single time per channel
 *      instance." -- i.e. the crash was narrowed, not eliminated, and only
 *      appeared fixed against a slow remount (e.g. Next.js Fast Refresh,
 *      whose 1-2s rebuild delay is far longer than the real async
 *      unsubscribe round-trip) rather than a fast/same-tick one.
 *
 * There is also no safe way to make the remove-then-recreate approach fully
 * correct by simply awaiting the removal first: page transitions in this
 * app use framer-motion's AnimatePresence (each app's own components/
 * page-transition.tsx), which deliberately keeps an outgoing page's component --
 * and its still-active realtime subscription -- mounted alongside the
 * incoming page's for the duration of the exit animation. Two legitimate,
 * simultaneously-mounted component instances can therefore hold the exact
 * same conceptual topic (e.g. `ride:<id>`) at once; removing "the existing
 * channel for this topic" in that window would silently kill the outgoing
 * page's subscription out from under it, not just a stale one.
 *
 * The actual fix: never let two calls share a topic in the first place.
 * Realtime topics only need to be unique on this client -- they are never
 * matched against anything server-side beyond the `filter` passed to
 * `.on()`, which this in no way changes -- so appending a per-call sequence
 * number guarantees supabase.channel() always creates a genuinely new
 * object, with its own `joinedOnce = false`, regardless of what any other
 * call (a stale remount, or a still-legitimately-mounted sibling) is doing
 * with what is conceptually "the same" subscription. This also means
 * freshChannel() can never remove -- or even see -- another call's channel;
 * each caller's own returned cleanup (`() => supabase.removeChannel(channel)`)
 * remains the only thing that ever tears down the specific instance it
 * created, unchanged from before.
 */
export function freshChannel(supabase: SupabaseClient, topic: string) {
  return supabase.channel(`${topic}:${++channelSequence}`);
}
