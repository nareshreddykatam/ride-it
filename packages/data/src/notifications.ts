import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationRow } from "./types";

const NOTIFICATION_COLUMNS = "id, user_id, type, title, body, data, is_read, created_at";

export async function listNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 30
): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as NotificationRow[];
}

export async function markNotificationRead(supabase: SupabaseClient, notificationId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
}

/**
 * Subscribes to new notifications for a specific user — filtered to
 * `user_id=eq.<userId>`, not a broadcast-all subscription, matching the
 * targeted-subscription pattern established in Phases 8/9.
 * notifications_select_own RLS (Phase 3) scopes what actually arrives.
 */
export function subscribeToNotifications(supabase: SupabaseClient, userId: string, onNew: (notification: NotificationRow) => void) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => onNew(payload.new as unknown as NotificationRow)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
