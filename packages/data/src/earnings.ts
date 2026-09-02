import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideRow } from "./types";

export type EarningsRange = "today" | "week" | "month";

function rangeStartDate(range: EarningsRange): Date {
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return d;
}

const EARNINGS_RIDE_COLUMNS = "id, pickup_address, drop_address, total_fare, requested_at, completed_at, status";

export interface DriverEarningsSummary {
  totalEarnings: number;
  ridesCompleted: number;
  rides: RideRow[];
}

/**
 * Earnings are always derived from `rides` (sum of total_fare where this
 * driver completed the ride), never stored as a running total anywhere —
 * a stored/cached total would just be a copy of this query that could
 * drift out of sync. Ridora's whole pitch is drivers keep 100% of the
 * fare, so this sum *is* the driver's take-home, with no commission
 * subtracted anywhere in this query.
 */
export async function getDriverEarningsSummary(
  supabase: SupabaseClient,
  driverId: string,
  range: EarningsRange
): Promise<DriverEarningsSummary> {
  const { data, error } = await supabase
    .from("rides")
    .select(EARNINGS_RIDE_COLUMNS)
    .eq("driver_id", driverId)
    .in("status", ["ride_completed", "rated"])
    .gte("requested_at", rangeStartDate(range).toISOString())
    .order("requested_at", { ascending: false });

  if (error) throw error;
  const rides = (data ?? []) as unknown as RideRow[];

  return {
    totalEarnings: rides.reduce((sum, r) => sum + r.total_fare, 0),
    ridesCompleted: rides.length,
    rides,
  };
}
