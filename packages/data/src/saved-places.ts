import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedPlaceRow } from "./types";
import type { GeoPointInput } from "./rides";

// lat/lng are PostgREST computed columns (20260824090000) backed by
// saved_places_lat()/saved_places_lng() functions — PostgREST exposes a
// computed column under the function's own name, not an implied short
// alias, so the `lat:saved_places_lat` syntax is required to select it as
// `lat` (confirmed against the live hosted schema; the unaliased form
// fails with "column saved_places.lat does not exist" even though the
// migration applied successfully — the function genuinely isn't named
// that).
const SAVED_PLACE_COLUMNS =
  "id, passenger_id, label, address, icon, is_default, created_at, lat:saved_places_lat, lng:saved_places_lng";

function toWkt({ lat, lng }: GeoPointInput): string {
  return `POINT(${lng} ${lat})`;
}

export async function listSavedPlaces(supabase: SupabaseClient, passengerId: string): Promise<SavedPlaceRow[]> {
  const { data, error } = await supabase
    .from("saved_places")
    .select(SAVED_PLACE_COLUMNS)
    .eq("passenger_id", passengerId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as SavedPlaceRow[];
}

export interface CreateSavedPlaceInput {
  passengerId: string;
  label: string;
  address: string;
  location: GeoPointInput;
  icon?: string;
}

export async function createSavedPlace(supabase: SupabaseClient, input: CreateSavedPlaceInput): Promise<SavedPlaceRow> {
  const { data, error } = await supabase
    .from("saved_places")
    .insert({
      passenger_id: input.passengerId,
      label: input.label,
      address: input.address,
      location: toWkt(input.location),
      icon: input.icon ?? null,
    })
    .select(SAVED_PLACE_COLUMNS)
    .single();

  if (error) throw error;
  return data as unknown as SavedPlaceRow;
}

export async function deleteSavedPlace(supabase: SupabaseClient, placeId: string): Promise<void> {
  const { error } = await supabase.from("saved_places").delete().eq("id", placeId);
  if (error) throw error;
}

export interface UpdateSavedPlaceInput {
  label?: string;
  address?: string;
  location?: GeoPointInput;
  icon?: string;
}

/** Part 8: "edit, rename" — same owner-scoped RLS (saved_places_update_own) as the rest of this table. */
export async function updateSavedPlace(
  supabase: SupabaseClient,
  placeId: string,
  input: UpdateSavedPlaceInput
): Promise<SavedPlaceRow> {
  const updates: Record<string, unknown> = {};
  if (input.label !== undefined) updates.label = input.label;
  if (input.address !== undefined) updates.address = input.address;
  if (input.location !== undefined) updates.location = toWkt(input.location);
  if (input.icon !== undefined) updates.icon = input.icon;

  const { data, error } = await supabase
    .from("saved_places")
    .update(updates)
    .eq("id", placeId)
    .select(SAVED_PLACE_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as SavedPlaceRow;
}
