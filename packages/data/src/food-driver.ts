import type { SupabaseClient } from "@supabase/supabase-js";
import { DriverWorkMode, driverWorkModeFromDb, driverWorkModeToDb } from "@ride-it/types";
import { freshChannel } from "./realtime";

export interface FoodDeliveryOffer {
  id: string;
  orderId: string;
  status: string;
  restaurantName: string;
  restaurantAddress: string;
  deliveryAddress: string;
  distanceToRestaurantMeters: number | null;
  orderAmount: number;
  driverEarning: number;
  expiresAt: string;
  offeredAt: string;
}

function mapAssignmentRow(row: any): FoodDeliveryOffer {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    restaurantName: row.restaurant_name_snapshot,
    restaurantAddress: row.restaurant_address_snapshot,
    deliveryAddress: row.delivery_address_snapshot,
    distanceToRestaurantMeters: row.distance_to_restaurant_meters,
    orderAmount: Number(row.order_amount),
    driverEarning: Number(row.driver_earning),
    expiresAt: row.expires_at,
    offeredAt: row.offered_at,
  };
}

/**
 * Switches the calling driver between RIDE and FOOD work mode.
 * set_driver_work_mode() (migration 20260914090900) rejects the switch
 * server-side if the driver holds a non-terminal ride or food delivery —
 * this wrapper surfaces that error as-is rather than swallowing it, so the
 * Driver app can show "Finish your current ride/delivery before switching
 * modes."
 */
export async function setDriverWorkMode(supabase: SupabaseClient, mode: DriverWorkMode): Promise<void> {
  const { error } = await supabase.rpc("set_driver_work_mode", { p_work_mode: driverWorkModeToDb(mode) });
  if (error) throw error;
}

export async function getDriverWorkMode(supabase: SupabaseClient, driverId: string): Promise<DriverWorkMode> {
  const { data, error } = await supabase.from("drivers").select("work_mode").eq("id", driverId).single();
  if (error) throw error;
  return driverWorkModeFromDb((data as any).work_mode);
}

export async function getActiveFoodDeliveryOffers(supabase: SupabaseClient): Promise<FoodDeliveryOffer[]> {
  const { data, error } = await supabase
    .from("food_delivery_assignments")
    .select("*")
    .eq("status", "offered")
    .gt("expires_at", new Date().toISOString());
  if (error) throw error;
  return (data ?? []).map(mapAssignmentRow);
}

export async function acceptFoodDeliveryOffer(supabase: SupabaseClient, orderId: string): Promise<FoodDeliveryOffer | null> {
  const { data, error } = await supabase.rpc("accept_food_delivery_offer", { p_order_id: orderId });
  if (error) throw error;
  return data ? mapAssignmentRow(data) : null;
}

export async function rejectFoodDeliveryOffer(supabase: SupabaseClient, orderId: string): Promise<void> {
  const { error } = await supabase.rpc("reject_food_delivery_offer", { p_order_id: orderId });
  if (error) throw error;
}

export async function driverMarkPickedUp(supabase: SupabaseClient, orderId: string): Promise<void> {
  const { error } = await supabase.rpc("driver_mark_picked_up", { p_order_id: orderId });
  if (error) throw error;
}

export async function driverMarkDelivered(supabase: SupabaseClient, orderId: string): Promise<void> {
  const { error } = await supabase.rpc("driver_mark_delivered", { p_order_id: orderId });
  if (error) throw error;
}

export interface ActiveFoodDeliveryRow {
  orderId: string;
  status: "driver_assigned" | "picked_up" | "out_for_delivery";
  restaurantName: string;
  restaurantAddress: string;
  restaurantLat: number;
  restaurantLng: number;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  recipientPhone: string;
  totalAmount: number;
  paymentMethod: "cod" | "online";
}

/** Uses the food_orders_restaurant_lat/lng and food_orders_delivery_lat/lng PostgREST computed columns (20260914091700) — a raw geography column select would return undecoded WKB, not usable coordinates. */
export async function getActiveFoodDelivery(supabase: SupabaseClient, driverId: string): Promise<ActiveFoodDeliveryRow | null> {
  const { data, error } = await supabase
    .from("food_orders")
    .select(
      "id, status, restaurant_name_snapshot, restaurant_address_snapshot, delivery_address, recipient_phone, total_amount, payment_method, restaurant_lat:food_orders_restaurant_lat, restaurant_lng:food_orders_restaurant_lng, delivery_lat:food_orders_delivery_lat, delivery_lng:food_orders_delivery_lng"
    )
    .eq("driver_id", driverId)
    .in("status", ["driver_assigned", "picked_up", "out_for_delivery"])
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as any;
  return {
    orderId: row.id,
    status: row.status,
    restaurantName: row.restaurant_name_snapshot,
    restaurantAddress: row.restaurant_address_snapshot,
    restaurantLat: row.restaurant_lat,
    restaurantLng: row.restaurant_lng,
    deliveryAddress: row.delivery_address,
    deliveryLat: row.delivery_lat,
    deliveryLng: row.delivery_lng,
    recipientPhone: row.recipient_phone,
    totalAmount: Number(row.total_amount),
    paymentMethod: row.payment_method,
  };
}

export function subscribeToFoodDeliveryOffers(supabase: SupabaseClient, driverId: string, onOffer: (offer: FoodDeliveryOffer) => void) {
  const channel = freshChannel(supabase, `driver-food-offers:${driverId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "food_delivery_assignments", filter: `driver_id=eq.${driverId}` },
      (payload) => onOffer(mapAssignmentRow(payload.new))
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToFoodDeliveryOfferUpdates(
  supabase: SupabaseClient,
  driverId: string,
  onUpdate: (offer: FoodDeliveryOffer) => void
) {
  const channel = freshChannel(supabase, `driver-food-offer-updates:${driverId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "food_delivery_assignments", filter: `driver_id=eq.${driverId}` },
      (payload) => onUpdate(mapAssignmentRow(payload.new))
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
