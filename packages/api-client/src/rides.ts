import type { FareEstimate, GeoPoint, Ride, VehicleType } from "@ride-it/types";
import { apiFetch } from "./http";

export interface FareEstimateRequest {
  pickup: GeoPoint;
  drop: GeoPoint;
}

export const ridesApi = {
  getFareEstimates: (payload: FareEstimateRequest) =>
    apiFetch<FareEstimate[]>("/rides/fare-estimate", { method: "POST", body: payload }),

  bookRide: (payload: { pickup: GeoPoint; drop: GeoPoint; vehicleType: VehicleType }) =>
    apiFetch<Ride>("/rides", { method: "POST", body: payload }),

  getRide: (rideId: string) => apiFetch<Ride>(`/rides/${rideId}`),

  cancelRide: (rideId: string, reason: string) =>
    apiFetch<Ride>(`/rides/${rideId}/cancel`, { method: "POST", body: { reason } }),

  getRideHistory: () => apiFetch<Ride[]>("/rides/history"),

  rateRide: (rideId: string, rating: number, comment?: string) =>
    apiFetch<Ride>(`/rides/${rideId}/rate`, { method: "POST", body: { rating, comment } }),
};
