import type { SupabaseClient } from "@supabase/supabase-js";
import type { SafetyEventRow, SafetyEventNoteRow } from "./types";

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

const SAFETY_EVENT_COLUMNS =
  "id, user_id, triggered_by_role, ride_id, status, severity, event_type, latitude, longitude, note, acknowledged_at, resolved_at, created_at";

/** The caller's own past safety events — safety_events_select_own RLS scopes this to their own rows only. */
export async function listOwnSafetyEvents(supabase: SupabaseClient, userId: string): Promise<SafetyEventRow[]> {
  const { data, error } = await supabase
    .from("safety_events")
    .select(SAFETY_EVENT_COLUMNS)
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
  category: "safety" | "driver_issue" | "passenger_issue" | "ride_issue" | "payment_issue" | "other";
  subject: string;
  description?: string;
  reportedUserId?: string;
  severity?: "low" | "medium" | "high" | "critical";
}

export interface ReportReasonOption {
  value: string;
  label: string;
  category: CreateReportInput["category"];
}

// Typed as a non-empty tuple (not plain ReportReasonOption[]) specifically
// so `PASSENGER_REPORT_REASONS[0]`/`DRIVER_REPORT_REASONS[0]` — used as
// each report form's default selection — resolve to ReportReasonOption,
// not `ReportReasonOption | undefined`, under this project's
// noUncheckedIndexedAccess.
type ReportReasonList = readonly [ReportReasonOption, ...ReportReasonOption[]];

/** Passenger-facing report reasons — each maps onto the existing support_ticket_category_enum rather than a new taxonomy; the specific reason itself lives in the ticket's subject. */
export const PASSENGER_REPORT_REASONS: ReportReasonList = [
  { value: "unsafe_driving", label: "Unsafe driving", category: "driver_issue" },
  { value: "harassment", label: "Harassment", category: "safety" },
  { value: "inappropriate_behavior", label: "Inappropriate behavior", category: "safety" },
  { value: "vehicle_issue", label: "Vehicle issue", category: "driver_issue" },
  { value: "payment_issue", label: "Payment issue", category: "payment_issue" },
  { value: "other", label: "Other", category: "other" },
];

/** Driver-facing report reasons — same mapping approach as PASSENGER_REPORT_REASONS. */
export const DRIVER_REPORT_REASONS: ReportReasonList = [
  { value: "unsafe_passenger", label: "Unsafe passenger", category: "passenger_issue" },
  { value: "harassment", label: "Harassment", category: "safety" },
  { value: "abuse", label: "Abuse", category: "safety" },
  { value: "payment_issue", label: "Payment issue", category: "payment_issue" },
  { value: "false_booking", label: "False booking", category: "passenger_issue" },
  { value: "other", label: "Other", category: "other" },
];

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

/**
 * Admin-only audit trail for one safety event — every status transition
 * (from set_safety_event_status()) and every free-standing note (from
 * add_safety_event_note()), oldest first. Secured by
 * safety_event_notes_all_admin RLS (migration 20260829090200); a
 * passenger/driver session gets zero rows, even for their own event.
 */
export async function listSafetyEventNotes(supabase: SupabaseClient, safetyEventId: string): Promise<SafetyEventNoteRow[]> {
  const { data, error } = await supabase
    .from("safety_event_notes")
    // users!admin_users_id_fkey — admin_users is the target of several other
    // one-to-many FKs (app_settings.updated_by, support_tickets.assigned_admin_id,
    // etc.), so the bare `users:id` hint is ambiguous here too (same PGRST201
    // pattern as admin.ts's listAdminUsers/ADMIN_RIDE_COLUMNS).
    .select(
      "id, safety_event_id, admin_id, note, status_transition_to, created_at, admin_users(users!admin_users_id_fkey(full_name))"
    )
    .eq("safety_event_id", safetyEventId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  type Raw = {
    id: string;
    safety_event_id: string;
    admin_id: string | null;
    note: string | null;
    status_transition_to: SafetyEventNoteRow["status_transition_to"];
    created_at: string;
    admin_users: { users: { full_name: string | null } | Array<{ full_name: string | null }> } | Array<{ users: unknown }> | null;
  };

  return ((data ?? []) as unknown as Raw[]).map((r) => {
    const adminUser = Array.isArray(r.admin_users) ? r.admin_users[0] : r.admin_users;
    const usersRow = adminUser?.users;
    const nameRow = Array.isArray(usersRow) ? usersRow[0] : (usersRow as { full_name: string | null } | undefined);
    return { ...r, admin_name: nameRow?.full_name ?? null };
  });
}

/** Admin-only free-standing note (no status change) — calls add_safety_event_note(), which independently re-checks is_admin() itself. */
export async function addSafetyEventNote(supabase: SupabaseClient, safetyEventId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("add_safety_event_note", { p_event_id: safetyEventId, p_note: note });
  if (error) throw error;
}
