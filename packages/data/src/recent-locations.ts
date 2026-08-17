import type { SupabaseClient } from "@supabase/supabase-js";

export interface RecentLocationRow {
  id: string;
  passenger_id: string;
  label: string | null;
  address: string;
  place_id: string | null;
  last_used_at: string;
}

const RECENT_LOCATION_COLUMNS = "id, passenger_id, label, address, place_id, last_used_at";

/** Most-recently-used locations first. Part 9: "approximately the latest 5-10" — callers pass limit accordingly. */
export async function listRecentLocations(
  supabase: SupabaseClient,
  passengerId: string,
  limit = 8
): Promise<RecentLocationRow[]> {
  const { data, error } = await supabase
    .from("recent_locations")
    .select(RECENT_LOCATION_COLUMNS)
    .eq("passenger_id", passengerId)
    .order("last_used_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as RecentLocationRow[];
}

export interface RecordRecentLocationInput {
  address: string;
  lat: number;
  lng: number;
  label?: string;
  placeId?: string;
}

/**
 * Sole write path — calls upsert_recent_location() (SECURITY DEFINER),
 * which dedupes by (passenger_id, lower(address)) so repeatedly selecting
 * the same place bumps last_used_at instead of creating a duplicate row,
 * and trims the caller's own history server-side. There is no direct
 * INSERT/UPDATE RLS policy on recent_locations by design — this RPC is
 * the only way to write it, matching the driver_documents/
 * replace_driver_document() pattern.
 */
export async function recordRecentLocation(supabase: SupabaseClient, input: RecordRecentLocationInput): Promise<void> {
  const { error } = await supabase.rpc("upsert_recent_location", {
    p_address: input.address,
    p_lat: input.lat,
    p_lng: input.lng,
    p_label: input.label ?? null,
    p_place_id: input.placeId ?? null,
  });
  if (error) throw error;
}
