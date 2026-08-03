/**
 * Ride lifecycle — matches Ride_It_Master_PRD_v1 §10 exactly.
 * Both Passenger and Driver apps drive their UI off this single enum
 * so the two clients can never disagree about what state a ride is in.
 */
export enum RideStatus {
  REQUESTED = "REQUESTED",
  MATCHED = "MATCHED",
  ACCEPTED = "ACCEPTED",
  DRIVER_ARRIVING = "DRIVER_ARRIVING",
  OTP_VERIFIED = "OTP_VERIFIED",
  RIDE_STARTED = "RIDE_STARTED",
  RIDE_COMPLETED = "RIDE_COMPLETED",
  PAYMENT = "PAYMENT",
  RATED = "RATED",
  CANCELLED = "CANCELLED",
}

export enum VehicleType {
  BIKE = "BIKE",
  AUTO = "AUTO",
}

export enum PaymentMethod {
  CASH = "CASH",
  UPI = "UPI",
}

export interface GeoPoint {
  lat: number;
  lng: number;
  address?: string;
}

export interface FareEstimate {
  vehicleType: VehicleType;
  baseFare: number;
  distanceFare: number;
  totalFare: number;
  currency: "INR";
  distanceKm: number;
  etaMinutes: number;
}

export interface Ride {
  id: string;
  status: RideStatus;
  vehicleType: VehicleType;
  passengerId: string;
  driverId?: string;
  pickup: GeoPoint;
  drop: GeoPoint;
  fare: FareEstimate;
  otp: string;
  paymentMethod?: PaymentMethod;
  requestedAt: string;
  completedAt?: string;
  passengerRating?: number;
  driverRating?: number;
  cancelledBy?: "PASSENGER" | "DRIVER" | "SYSTEM";
  cancellationReason?: string;
}
