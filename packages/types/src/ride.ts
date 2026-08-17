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
  SCOOTY = "SCOOTY",
  AUTO = "AUTO",
  CAR = "CAR",
}

/**
 * The single place this codebase converts between the frontend's
 * uppercase VehicleType enum and the database's lowercase
 * vehicle_type_enum values. Callers that need the DB string (createRide,
 * driver vehicle records, etc.) should use this rather than re-deriving
 * their own ternary — see Part 7's "don't scatter hardcoded vehicle logic"
 * requirement.
 */
export function vehicleTypeToDb(vehicleType: VehicleType): "bike" | "scooty" | "auto" | "car" {
  return vehicleType.toLowerCase() as "bike" | "scooty" | "auto" | "car";
}

export function vehicleTypeFromDb(dbValue: "bike" | "scooty" | "auto" | "car"): VehicleType {
  return dbValue.toUpperCase() as VehicleType;
}

/** Display label keyed by the DB's lowercase vehicle_type_enum value — for screens that read a raw DB row rather than a VehicleType. */
export const VEHICLE_TYPE_LABELS_DB: Record<"bike" | "scooty" | "auto" | "car", string> = {
  bike: "Bike",
  scooty: "Scooty",
  auto: "Auto",
  car: "Car",
};

export enum PaymentMethod {
  CASH = "CASH",
  DRIVER_UPI = "DRIVER_UPI",
  ONLINE = "ONLINE",
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
