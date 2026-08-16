import type { SupabaseClient } from "@supabase/supabase-js";

export type DevicePlatform = "web" | "ios" | "android";

export interface NotificationDeviceRow {
  id: string;
  user_id: string;
  platform: DevicePlatform;
  push_token: string;
  push_enabled: boolean;
  created_at: string;
}

/**
 * Registers (or re-registers) a push token for the current user — secured
 * by notification_devices_all_own RLS (self-only). This is architecture
 * only: nothing in this codebase currently obtains a real push token
 * (that requires Web Push VAPID keys / FCM / APNs configuration not
 * present in this environment — see the Phase 10 review doc). Calling
 * this with a placeholder token is harmless but doesn't make push
 * notifications real.
 */
export async function registerNotificationDevice(
  supabase: SupabaseClient,
  userId: string,
  platform: DevicePlatform,
  pushToken: string
): Promise<void> {
  const { error } = await supabase
    .from("notification_devices")
    .upsert({ user_id: userId, platform, push_token: pushToken, push_enabled: true }, { onConflict: "user_id,push_token" });
  if (error) throw error;
}

export async function setDevicePushEnabled(supabase: SupabaseClient, deviceId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from("notification_devices").update({ push_enabled: enabled }).eq("id", deviceId);
  if (error) throw error;
}

export async function listOwnDevices(supabase: SupabaseClient, userId: string): Promise<NotificationDeviceRow[]> {
  const { data, error } = await supabase
    .from("notification_devices")
    .select("id, user_id, platform, push_token, push_enabled, created_at")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as unknown as NotificationDeviceRow[];
}
