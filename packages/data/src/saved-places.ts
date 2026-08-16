import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedPlaceRow } from "./types";
import type { GeoPointInput } from "./rides";

const SAVED_PLACE_COLUMNS = "id, passenger_id, label, address, icon, is_default, created_at";

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
