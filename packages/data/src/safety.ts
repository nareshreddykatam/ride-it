import type { SupabaseClient } from "@supabase/supabase-js";
import type { SafetyEventRow } from "./types";

/**
 * Triggers a real SOS via trigger_sos() (Phase 13) — the only way a
 * safety_events row is created. lat/lng are a best-effort snapshot from
 * the caller's own device geolocation at the moment of activation, not a
 * live-tracked stream. Never claims to contact emergency services —
 * that's an app-layer UI-copy responsibility, not this function's.
 */
export async function triggerSos(
  supabase: SupabaseClient,
  options: { rideId?: string; lat?: number; lng?: number; note?: string } = {}
): Promise<SafetyEventRow> {
  const { data, error } = await supabase.rpc("trigger_sos", {
    p_ride_id: options.rideId ?? null,
    p_latitude: options.lat ?? null,
    p_longitude: options.lng ?? null,
    p_note: options.note ?? null,
  });
  if (error) throw error;
  return data as unknown as SafetyEventRow;
}

/** The caller's own past safety events — safety_events_select_own RLS scopes this to their own rows only. */
export async function listOwnSafetyEvents(supabase: SupabaseClient, userId: string): Promise<SafetyEventRow[]> {
  const { data, error } = await supabase
    .from("safety_events")
    .select("id, user_id, triggered_by_role, ride_id, status, latitude, longitude, note, acknowledged_at, resolved_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SafetyEventRow[];
}

/**
 * Reads a single app_settings value — reuses the existing
 * app_settings_select_authenticated RLS policy (Phase 7/8), already
 * readable by any authenticated passenger/driver, not just admin. Used
 * here for the configuration-driven emergency contact number (item 5:
 * "Do not hardcode an emergency number throughout the application").
 */
export async function getAppSettingValue(supabase: SupabaseClient, key: string): Promise<unknown> {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return (data as unknown as { value: unknown } | null)?.value ?? null;
}

export interface CreateReportInput {
  userId: string;
  rideId?: string;
  category: "safety" | "driver_issue" | "passenger_issue" | "ride_issue" | "other";
  subject: string;
  description?: string;
  reportedUserId?: string;
  severity?: "low" | "medium" | "high" | "critical";
}

/**
 * Creates a report/support ticket — support_tickets_insert_own RLS
 * (Phase 3) already scopes user_id to the caller's own session; this
 * just gives the call a typed shape instead of a raw .insert() (which
 * resolves to `never` against this project's placeholder Database type,
 * the same issue fixed with typed wrappers throughout Phase 11).
 */
export async function createReport(supabase: SupabaseClient, input: CreateReportInput): Promise<void> {
  const { error } = await supabase.from("support_tickets").insert({
    user_id: input.userId,
    ride_id: input.rideId ?? null,
    category: input.category,
    subject: input.subject,
    description: input.description ?? null,
    reported_user_id: input.reportedUserId ?? null,
    severity: input.severity ?? "medium",
  } as never);
  if (error) throw error;
}
