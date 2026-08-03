export enum UserRole {
  PASSENGER = "PASSENGER",
  DRIVER = "DRIVER",
  ADMIN = "ADMIN",
  SUPPORT_ADMIN = "SUPPORT_ADMIN",
  FINANCE_ADMIN = "FINANCE_ADMIN",
  OPERATIONS_ADMIN = "OPERATIONS_ADMIN",
}

export enum DriverVerificationStatus {
  PENDING = "PENDING",
  IN_REVIEW = "IN_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  SUSPENDED = "SUSPENDED",
}

export enum SubscriptionPlan {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  YEARLY = "YEARLY",
}

export enum SubscriptionStatus {
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
  GRACE_PERIOD = "GRACE_PERIOD", // pending PRD confirmation — see gap #8
  CANCELLED = "CANCELLED",
}

export interface Subscription {
  id: string;
  driverId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: string;
  expiresAt: string;
  amount: number;
  currency: "INR";
}

export interface PassengerProfile {
  id: string;
  role: UserRole.PASSENGER;
  name: string;
  phone: string;
  email?: string;
  rating: number;
  createdAt: string;
}

export interface DriverProfile {
  id: string;
  role: UserRole.DRIVER;
  name: string;
  phone: string;
  vehicleType: "BIKE" | "AUTO";
  verificationStatus: DriverVerificationStatus;
  documents: {
    aadhaar?: DocumentUpload;
    drivingLicense?: DocumentUpload;
    rc?: DocumentUpload;
    insurance?: DocumentUpload;
    selfie?: DocumentUpload;
  };
  activeSubscription?: Subscription;
  isOnline: boolean;
  rating: number;
  walletBalance: number;
  /**
   * Business rule (confirmed): a driver who cancels after accepting a ride
   * takes a strike; the ride is re-matched to another driver. Suspension
   * threshold for accumulated strikes is not yet specified by the PRDs —
   * flagged as an open item, not assumed here.
   */
  strikeCount: number;
  createdAt: string;
}

export interface DocumentUpload {
  url: string;
  status: DriverVerificationStatus;
  uploadedAt: string;
  rejectionReason?: string;
}
