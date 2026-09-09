import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideMessageRow, RideStatusRow } from "./types";
import { freshChannel } from "./realtime";

const MESSAGE_COLUMNS = "id, ride_id, sender_id, message, created_at, read_at";
const MESSAGES_PAGE_SIZE = 30;

/**
 * Ride statuses that still permit SENDING a new message — mirrors
 * send_ride_message()'s own status check exactly (migration
 * 20260909060000_ride_messages.sql). This client-side mirror is for UI
 * state only (disabling the input, showing "chat ended"); the RPC is the
 * actual authority and re-validates this independently server-side.
 */
export const RIDE_CHAT_SENDABLE_STATUSES: readonly RideStatusRow[] = [
  "accepted",
  "driver_arriving",
  "ride_started",
  "destination_reached",
  "payment_collected",
];

/** Whether chat is available at all (read + realtime) for this ride — true once a driver is assigned, regardless of status, matching the SELECT RLS policy's own condition. */
export function isRideChatAvailable(driverId: string | null): boolean {
  return driverId !== null;
}

/** Whether a new message can currently be sent — matches send_ride_message()'s status gate. UI-only; the server re-checks this for real. */
export function canSendRideMessage(status: RideStatusRow, driverId: string | null): boolean {
  return driverId !== null && RIDE_CHAT_SENDABLE_STATUSES.includes(status);
}

export interface RideMessagesPage {
  /** Chronological order (oldest first), ready to render/prepend directly. */
  messages: RideMessageRow[];
  /** True if there may be older messages before this page — pass the oldest message's created_at/id as the next `before` cursor. */
  hasMore: boolean;
}

/**
 * Fetches one page of a ride's messages, newest page first (most recent
 * `pageSize` messages) unless a `before` cursor is given, in which case it
 * fetches the page immediately older than that cursor — cursor-based
 * pagination, not an arbitrary fixed history cap. The composite
 * (created_at, id) cursor (id as tiebreaker) guards against the
 * theoretical same-millisecond collision case, per the two messages
 * genuinely being distinguishable rows even if their timestamps tie.
 * RLS (ride_messages_select_participant) is the actual authorization —
 * this is a thin, safe pass-through, same pattern as
 * getActiveOffersForDriver.
 */
export async function getRideMessages(
  supabase: SupabaseClient,
  rideId: string,
  opts?: { before?: { createdAt: string; id: string }; pageSize?: number }
): Promise<RideMessagesPage> {
  const pageSize = opts?.pageSize ?? MESSAGES_PAGE_SIZE;
  let query = supabase
    .from("ride_messages")
    .select(MESSAGE_COLUMNS)
    .eq("ride_id", rideId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize);

  if (opts?.before) {
    // "strictly older than the cursor row": created_at < X, or the same
    // created_at with a strictly smaller id (server-echoed ISO
    // timestamp/UUID values only — never raw user text — so building
    // this filter string is safe).
    query = query.or(
      `created_at.lt.${opts.before.createdAt},and(created_at.eq.${opts.before.createdAt},id.lt.${opts.before.id})`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as RideMessageRow[];
  return {
    messages: rows.slice().reverse(),
    hasMore: rows.length === pageSize,
  };
}

/**
 * Sends a message via send_ride_message() (migration 20260909060000) —
 * the RPC derives the sender from auth.uid() and independently
 * re-validates participant status, ride status, and message content;
 * this is a thin typed pass-through, not where any of that is decided.
 */
export async function sendRideMessage(supabase: SupabaseClient, rideId: string, message: string): Promise<RideMessageRow> {
  const { data, error } = await supabase.rpc("send_ride_message", { p_ride_id: rideId, p_message: message });
  if (error) throw error;
  return data as unknown as RideMessageRow;
}

/** Marks the caller's unread incoming messages on this ride as read, via mark_ride_messages_read(). Returns the number of messages marked. */
export async function markRideMessagesRead(supabase: SupabaseClient, rideId: string): Promise<number> {
  const { data, error } = await supabase.rpc("mark_ride_messages_read", { p_ride_id: rideId });
  if (error) throw error;
  return (data as unknown as number) ?? 0;
}

/**
 * Unread-badge count for one ride: messages sent by the OTHER
 * participant that this caller hasn't read yet. A `head: true` count
 * query — no rows are actually fetched, just the count, so this is cheap
 * enough to call from a ride-status screen without opening the chat.
 */
export async function getUnreadRideMessageCount(
  supabase: SupabaseClient,
  rideId: string,
  currentUserId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("ride_messages")
    .select("id", { count: "exact", head: true })
    .eq("ride_id", rideId)
    .neq("sender_id", currentUserId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Subscribes to new messages on one ride. Filtered to `ride_id=eq.<rideId>`
 * — RLS (ride_messages_select_participant) still applies per event, same
 * as every other realtime subscription in this codebase (see
 * subscribeToDriverOffers' comment): a non-participant's subscription to
 * a ride they can't read simply never fires, not a separate trust
 * boundary. Uses freshChannel() — never call supabase.channel() directly
 * — so reopening the chat or switching rides can never hit the
 * documented "tried to join multiple times" Realtime bug (see
 * packages/data/src/realtime.ts).
 */
export function subscribeToRideMessages(
  supabase: SupabaseClient,
  rideId: string,
  onMessage: (message: RideMessageRow) => void
) {
  const channel = freshChannel(supabase, `ride-messages:${rideId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "ride_messages", filter: `ride_id=eq.${rideId}` },
      (payload) => onMessage(payload.new as unknown as RideMessageRow)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
