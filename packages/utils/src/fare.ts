import { VehicleType, type FareEstimate } from "@ride-it/types";

/**
 * Confirmed fare model: base fare + per-km rate, no surge, no per-minute
 * component. Rates below are placeholders pending Admin System Settings ->
 * Pricing config (Admin PRD §System Settings) — this function is the single
 * place that logic lives so Passenger estimate and Admin config never drift
 * apart once a real pricing endpoint exists.
 */
export const FARE_RATES: Record<VehicleType, { baseFare: number; perKm: number }> = {
  [VehicleType.BIKE]: { baseFare: 15, perKm: 6 },
  [VehicleType.SCOOTY]: { baseFare: 18, perKm: 7 },
  [VehicleType.AUTO]: { baseFare: 25, perKm: 12 },
  [VehicleType.CAR]: { baseFare: 40, perKm: 16 },
};

export function computeFareEstimate(
  vehicleType: VehicleType,
  distanceKm: number,
  etaMinutes: number
): FareEstimate {
  const { baseFare, perKm } = FARE_RATES[vehicleType];
  const distanceFare = Math.round(perKm * distanceKm);
  return {
    vehicleType,
    baseFare,
    distanceFare,
    totalFare: baseFare + distanceFare,
    currency: "INR",
    distanceKm,
    etaMinutes,
  };
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}
