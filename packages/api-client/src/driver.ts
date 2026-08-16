import type { DriverProfile, Ride } from "@ride-it/types";
import { apiFetch } from "./http";

export const driverApi = {
  getProfile: () => apiFetch<DriverProfile>("/driver/me"),

  setOnlineStatus: (isOnline: boolean) =>
    apiFetch<DriverProfile>("/driver/status", { method: "PATCH", body: { isOnline } }),

  getEarningsSummary: (range: "today" | "week" | "month" = "today") =>
    apiFetch<{ totalEarnings: number; ridesCompleted: number; range: string }>(
      `/driver/earnings?range=${range}`
    ),

  getWallet: () => apiFetch<{ balance: number; currency: "INR" }>("/driver/wallet"),

  // Ride requests arrive over the realtime layer (Socket.IO) in production;
  // these REST calls are the accept/reject/response endpoints that fire once
  // the driver acts on a request within the offer window.
  acceptRideRequest: (rideId: string) =>
    apiFetch<Ride>(`/driver/ride-requests/${rideId}/accept`, { method: "POST" }),

  rejectRideRequest: (rideId: string) =>
    apiFetch<{ ok: true }>(`/driver/ride-requests/${rideId}/reject`, { method: "POST" }),

  /**
   * Cancelling after acceptance issues a strike and re-matches the ride to
   * another driver (confirmed business rule — suspension threshold for
   * accumulated strikes is not yet specified in the PRDs).
   */
  cancelAcceptedRide: (rideId: string, reason: string) =>
    apiFetch<{ ride: Ride; strikeCount: number }>(`/driver/rides/${rideId}/cancel`, {
      method: "POST",
      body: { reason },
    }),
};
