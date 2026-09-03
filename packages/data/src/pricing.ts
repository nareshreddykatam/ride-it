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

export interface ActivePricingRule {
  id: string;
  vehicle_type: VehicleTypeRow;
  base_fare: number;
  per_km_rate: number;
}

/**
 * Reads the currently-active, city-unscoped pricing rule for every vehicle
 * type — the exact rule compute_ride_fare() itself will apply for a ride
 * with no city_id (this booking flow doesn't collect one yet; see
 * createRide()'s own comment). Real Postgres RLS (pricing_rules_select_authenticated,
 * 20260803120xxx) already lets any authenticated user read active rules
 * directly — no wrapper RPC needed, same trust level as the passenger
 * booking flow already operates at. Returns [] (not throws-away-defaults)
 * if nothing is configured for a vehicle type — callers must treat that
 * vehicle as genuinely unavailable to book, not silently substitute a
 * guessed rate.
 */
export async function getActivePricingRules(supabase: SupabaseClient): Promise<ActivePricingRule[]> {
  const { data, error } = await supabase
    .from("pricing_rules")
    .select("id, vehicle_type, base_fare, per_km_rate")
    .eq("is_active", true)
    .is("city_id", null);
  if (error) throw error;
  return (data ?? []) as unknown as ActivePricingRule[];
}

export interface SurgeStatusRow {
  vehicle_type: VehicleTypeRow;
  /** The multiplier actually in effect for this vehicle type right now — 1.00 if surge is off or this vehicle isn't currently surged. */
  vehicle_multiplier: number;
}

/**
 * Wraps the existing get_surge_status() RPC (20260831130000_surge_pricing.sql)
 * — the SAME effective-multiplier computation compute_ride_fare() uses
 * internally, exposed read-only for display. Never recompute surge
 * client-side; this is the one sanctioned read path.
 */
export async function getSurgeStatus(supabase: SupabaseClient): Promise<SurgeStatusRow[]> {
  const { data, error } = await supabase.rpc("get_surge_status");
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ vehicle_type: VehicleTypeRow; vehicle_multiplier: number }>).map((row) => ({
    vehicle_type: row.vehicle_type,
    vehicle_multiplier: row.vehicle_multiplier,
  }));
}
