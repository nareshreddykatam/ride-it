/**
 * Ridora Food domain types. Enum values mirror the corresponding Postgres
 * enum exactly (lowercased), the same convention ride.ts's RideStatus
 * documents — the frontend enum and the database enum must never drift in
 * meaning even though each is enforced independently.
 */

export enum RestaurantStatus {
  PENDING_VERIFICATION = "PENDING_VERIFICATION",
  IN_REVIEW = "IN_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  SUSPENDED = "SUSPENDED",
}

export enum FoodVegType {
  VEG = "VEG",
  NON_VEG = "NON_VEG",
}

export enum FoodPaymentMethod {
  COD = "COD",
  ONLINE = "ONLINE",
}

export enum FoodOrderStatus {
  PLACED = "PLACED",
  ACCEPTED = "ACCEPTED",
  PREPARING = "PREPARING",
  READY_FOR_PICKUP = "READY_FOR_PICKUP",
  DRIVER_ASSIGNED = "DRIVER_ASSIGNED",
  PICKED_UP = "PICKED_UP",
  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
  REJECTED = "REJECTED",
  FAILED = "FAILED",
}

export const ACTIVE_FOOD_ORDER_STATUSES: FoodOrderStatus[] = [
  FoodOrderStatus.PLACED,
  FoodOrderStatus.ACCEPTED,
  FoodOrderStatus.PREPARING,
  FoodOrderStatus.READY_FOR_PICKUP,
  FoodOrderStatus.DRIVER_ASSIGNED,
  FoodOrderStatus.PICKED_UP,
  FoodOrderStatus.OUT_FOR_DELIVERY,
];

export enum FoodDeliveryAssignmentStatus {
  OFFERED = "OFFERED",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
  SUPERSEDED = "SUPERSEDED",
  PICKED_UP = "PICKED_UP",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
}

/** Driver work mode — RIDE and FOOD are mutually exclusive, enforced server-side (see supabase/migrations/20260914090900_driver_food_mode.sql). */
export enum DriverWorkMode {
  RIDE = "RIDE",
  FOOD = "FOOD",
}

export function driverWorkModeToDb(mode: DriverWorkMode): "ride" | "food" {
  return mode.toLowerCase() as "ride" | "food";
}

export function driverWorkModeFromDb(dbValue: "ride" | "food"): DriverWorkMode {
  return dbValue.toUpperCase() as DriverWorkMode;
}

export function foodVegTypeToDb(vegType: FoodVegType): "veg" | "non_veg" {
  return vegType === FoodVegType.VEG ? "veg" : "non_veg";
}

export function foodVegTypeFromDb(dbValue: "veg" | "non_veg"): FoodVegType {
  return dbValue === "veg" ? FoodVegType.VEG : FoodVegType.NON_VEG;
}

export function foodPaymentMethodToDb(method: FoodPaymentMethod): "cod" | "online" {
  return method === FoodPaymentMethod.COD ? "cod" : "online";
}

export interface FoodCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  displayOrder: number;
}

export interface RestaurantSummary {
  id: string;
  name: string;
  logoPath?: string | null;
  coverImagePath?: string | null;
  rating: number;
  totalRatings: number;
  avgPreparationMinutes: number;
  distanceKm: number;
  isOpen: boolean;
}

export interface Restaurant extends RestaurantSummary {
  description?: string | null;
  status: RestaurantStatus;
  address: string;
  landmark?: string | null;
  phone: string;
  email?: string | null;
  location: { lat: number; lng: number };
  categories: FoodCategory[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryDisplayOrder: number;
  name: string;
  description?: string | null;
  price: number;
  vegType: FoodVegType;
  imagePath?: string | null;
  isAvailable: boolean;
  displayOrder: number;
}

export interface CartItemSummary {
  cartId: string;
  restaurantId: string;
  cartItemId: string;
  menuItemId: string;
  itemName: string;
  quantity: number;
  currentUnitPrice: number;
  lineTotal: number;
  isAvailable: boolean;
  specialInstructions?: string | null;
}

export interface FoodOrderItem {
  id: string;
  menuItemId?: string | null;
  itemName: string;
  itemDescription?: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  vegType: FoodVegType;
  specialInstructions?: string | null;
}

export interface FoodOrder {
  id: string;
  passengerId: string;
  restaurantId: string;
  restaurantName: string;
  driverId?: string | null;
  status: FoodOrderStatus;
  isForSelf: boolean;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  deliveryLandmark?: string | null;
  distanceKm?: number | null;
  subtotalAmount: number;
  deliveryFee: number;
  platformFee: number;
  discountAmount: number;
  totalAmount: number;
  currency: "INR";
  paymentMethod: FoodPaymentMethod;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  specialInstructions?: string | null;
  cancellationReason?: string | null;
  placedAt: string;
  deliveredAt?: string | null;
  items?: FoodOrderItem[];
}

export interface RestaurantAnalytics {
  orderOverview: {
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    pendingOrders: number;
    totalRevenue: number;
  };
  paymentMix: {
    cashOnDelivery: number;
    onlinePayment: number;
  };
  menuPerformance: {
    topSeller?: { itemName: string; quantitySold: number } | null;
    revenueLeader?: { itemName: string; revenue: number } | null;
    leastOrdered?: { itemName: string; quantitySold: number } | null;
    bestRated?: { itemName: string; avgRating: number } | null;
  };
  customerTrends: {
    repeatCustomers: number;
    averageOrderValue: number;
    ordersByDay: Array<{ day: string; orders: number }>;
  };
  ratingInsights: {
    averageRating: number;
    totalRatings: number;
    ratingDistribution: Record<string, number>;
  };
}
