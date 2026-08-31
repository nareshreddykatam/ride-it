import { VehicleType, type FareEstimate } from "@ride-it/types";

/**
 * Last-resort constant, used ONLY when the real pricing_rules table (see
 * @ride-it/data's getActivePricingRules()) couldn't be read at all — never
 * the normal path. Both real call sites (apps/passenger's booking and
 * booking/confirm screens) fetch the admin-configured rate for each
 * vehicle type and pass it in via the `rate` parameter below; this table
 * only covers the honest-degradation case where that fetch itself failed,
 * so the screen can still render *something* rather than going blank —
 * every such render is expected to also show an "estimate may be
 * outdated" style message, never presented as equivalent to a real quote.
 */
export const FARE_RATES: Record<VehicleType, { baseFare: number; perKm: number }> = {
  [VehicleType.BIKE]: { baseFare: 15, perKm: 6 },
  [VehicleType.SCOOTY]: { baseFare: 18, perKm: 7 },
  [VehicleType.AUTO]: { baseFare: 25, perKm: 12 },
  [VehicleType.CAR]: { baseFare: 40, perKm: 16 },
};

export interface FareRate {
  baseFare: number;
  perKm: number;
  /** The effective multiplier for this vehicle type right now (see get_surge_status()) — 1 when surge is off/not applicable. */
  surgeMultiplier?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Client-side ESTIMATE only — compute_ride_fare() (the BEFORE INSERT
 * trigger on rides) remains the sole authoritative calculation at ride
 * creation and discards whatever this produces. The formula here is kept
 * bit-for-bit identical to that trigger's own (round the raw per-km
 * distance fare to a whole number first, THEN scale both components by
 * the surge multiplier and round to paise) so this estimate and the
 * eventual server total agree whenever the real rate/surge/distance
 * inputs match — see 20260831130000_surge_pricing.sql.
 *
 * `rate` should be the REAL admin-configured pricing_rules row (+ real
 * surge multiplier from get_surge_status()) for this vehicle type,
 * fetched by the caller — never hardcoded per vehicle in a UI component.
 * Omitting it falls back to FARE_RATES purely as an honest-degradation
 * last resort (see that constant's own comment).
 */
export function computeFareEstimate(
  vehicleType: VehicleType,
  distanceKm: number,
  etaMinutes: number,
  rate?: FareRate
): FareEstimate {
  const { baseFare: rawBase, perKm } = rate ?? FARE_RATES[vehicleType];
  const surgeMultiplier = rate?.surgeMultiplier ?? 1;
  const rawDistanceFare = Math.round(perKm * distanceKm);
  const baseFare = round2(rawBase * surgeMultiplier);
  const distanceFare = round2(rawDistanceFare * surgeMultiplier);
  return {
    vehicleType,
    baseFare,
    distanceFare,
    totalFare: round2(baseFare + distanceFare),
    currency: "INR",
    distanceKm,
    etaMinutes,
    surgeMultiplier,
  };
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}
