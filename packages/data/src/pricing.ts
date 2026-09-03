import type { SupabaseClient } from "@supabase/supabase-js";
import type { VehicleTypeRow } from "./types";

export interface FareQuoteInput {
  vehicleType: VehicleTypeRow;
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  distanceKm: number;
  cityId?: string;
}

export interface FareQuote {
  baseFare: number;
  distanceFare: number;
  surgeMultiplier: number;
  totalFare: number;
}

/**
 * The server-authoritative PRE-RIDE fare quote — wraps get_fare_quote()
 * (20260903094500_pre_ride_fare_quote.sql), which runs the EXACT same
 * calculation compute_ride_fare() applies at ride-creation time (both call
 * the shared _calculate_fare() SQL function). This is the only sanctioned
 * way to show a fare before "Find Ride" — never recompute the formula in
 * React/client JS (that duplication, and the drift it invited, is exactly
 * what this replaces; see booking/page.tsx and booking/confirm/page.tsx).
 * Throws if no active pricing rule exists for this vehicle type, or if
 * distanceKm is implausible for the given coordinates — callers must show
 * a real error state, never a fallback/guessed amount.
 */
export async function getFareQuote(supabase: SupabaseClient, input: FareQuoteInput): Promise<FareQuote> {
  const { data, error } = await supabase
    .rpc("get_fare_quote", {
      p_vehicle_type: input.vehicleType,
      p_pickup_lat: input.pickup.lat,
      p_pickup_lng: input.pickup.lng,
      p_drop_lat: input.drop.lat,
      p_drop_lng: input.drop.lng,
      p_distance_km: input.distanceKm,
      p_city_id: input.cityId ?? null,
    })
    .single();
  if (error) throw error;
  const row = data as unknown as { base_fare: number; distance_fare: number; surge_multiplier: number; total_fare: number };
  return {
    baseFare: Number(row.base_fare),
    distanceFare: Number(row.distance_fare),
    surgeMultiplier: Number(row.surge_multiplier),
    totalFare: Number(row.total_fare),
  };
}
