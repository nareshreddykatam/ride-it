import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharedRideInfo } from "./types";

export interface CreatedShare {
  id: string;
  token: string;
  expiresAt: string;
}

/**
 * Creates a share via create_ride_share() — the token is returned exactly
 * once, here, and never retrievable again afterward (same one-time-reveal
 * principle as Phase 10's Ride PIN). Build the shareable link/message
 * client-side from this token; do not persist the token anywhere beyond
 * what's needed to display/send it immediately.
 */
export async function createRideShare(
  supabase: SupabaseClient,
  rideId: string,
  options: { trustedContactId?: string; durationHours?: number } = {}
): Promise<CreatedShare> {
  const { data, error } = await supabase.rpc("create_ride_share", {
    p_ride_id: rideId,
    p_trusted_contact_id: options.trustedContactId ?? null,
    p_duration_hours: options.durationHours ?? 4,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; token: string; expires_at: string };
  return { id: row.id, token: row.token, expiresAt: row.expires_at };
}

export async function revokeRideShare(supabase: SupabaseClient, shareId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_ride_share", { p_share_id: shareId });
  if (error) throw error;
}

/**
 * The public, UNAUTHENTICATED read a trusted contact uses — calls
 * get_shared_ride_info(), the one anon-granted function in this project
 * (see its migration comment for the full security reasoning). Works
 * identically whether or not the caller has a Supabase session; no
 * auth.uid() check happens here or in the underlying RPC — token
 * possession is the entire authorization. Returns null for any invalid,
 * expired, revoked, or ride-ended token — never a distinguishing error.
 */
export async function getSharedRideInfo(supabase: SupabaseClient, token: string): Promise<SharedRideInfo | null> {
  const { data, error } = await supabase.rpc("get_shared_ride_info", { p_token: token });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        ride_status: SharedRideInfo["rideStatus"];
        driver_name: string | null;
        vehicle_type: SharedRideInfo["vehicleType"];
        pickup_address: string | null;
        drop_address: string | null;
        driver_lat: number | null;
        driver_lng: number | null;
        driver_location_updated_at: string | null;
        shared_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    rideStatus: row.ride_status,
    driverName: row.driver_name,
    vehicleType: row.vehicle_type,
    pickupAddress: row.pickup_address,
    dropAddress: row.drop_address,
    driverLocation: row.driver_lat !== null && row.driver_lng !== null ? { lat: row.driver_lat, lng: row.driver_lng } : null,
    driverLocationUpdatedAt: row.driver_location_updated_at,
    sharedAt: row.shared_at,
  };
}
