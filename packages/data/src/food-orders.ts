import type { SupabaseClient } from "@supabase/supabase-js";
import { type FoodOrder, type FoodOrderItem, FoodOrderStatus, FoodPaymentMethod, foodVegTypeFromDb, FoodVegType } from "@ride-it/types";
import { freshChannel } from "./realtime";

function mapOrderRow(row: any): FoodOrder {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name_snapshot,
    driverId: row.driver_id,
    status: row.status.toUpperCase().replace(/-/g, "_") as FoodOrderStatus,
    isForSelf: row.is_for_self,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    deliveryAddress: row.delivery_address,
    deliveryLandmark: row.delivery_landmark,
    distanceKm: row.distance_km !== null ? Number(row.distance_km) : null,
    subtotalAmount: Number(row.subtotal_amount),
    deliveryFee: Number(row.delivery_fee),
    platformFee: Number(row.platform_fee),
    discountAmount: Number(row.discount_amount),
    totalAmount: Number(row.total_amount),
    currency: "INR",
    paymentMethod: row.payment_method === "cod" ? FoodPaymentMethod.COD : FoodPaymentMethod.ONLINE,
    paymentStatus: row.payment_status.toUpperCase() as FoodOrder["paymentStatus"],
    specialInstructions: row.special_instructions,
    cancellationReason: row.cancellation_reason,
    placedAt: row.placed_at,
    deliveredAt: row.delivered_at,
  };
}

/**
 * Checkout. amount/pricing are re-derived server-side inside
 * create_food_order — this wrapper passes only the inputs a passenger
 * actually controls (recipient, delivery location, payment method),
 * never a price.
 */
export async function createFoodOrder(
  supabase: SupabaseClient,
  params: {
    recipientName: string;
    recipientPhone: string;
    isForSelf: boolean;
    deliveryAddress: string;
    deliveryLandmark?: string;
    deliveryLat: number;
    deliveryLng: number;
    paymentMethod: FoodPaymentMethod;
    specialInstructions?: string;
  }
): Promise<FoodOrder> {
  const { data, error } = await supabase.rpc("create_food_order", {
    p_recipient_name: params.recipientName,
    p_recipient_phone: params.recipientPhone,
    p_is_for_self: params.isForSelf,
    p_delivery_address: params.deliveryAddress,
    p_delivery_landmark: params.deliveryLandmark ?? null,
    p_delivery_lat: params.deliveryLat,
    p_delivery_lng: params.deliveryLng,
    p_payment_method: params.paymentMethod === FoodPaymentMethod.COD ? "cod" : "online",
    p_special_instructions: params.specialInstructions ?? null,
  });
  if (error) throw error;
  return mapOrderRow(data);
}

export async function getFoodOrder(supabase: SupabaseClient, orderId: string): Promise<FoodOrder | null> {
  const { data, error } = await supabase
    .from("food_orders")
    .select("*, food_order_items(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const order = mapOrderRow(data);
  order.items = ((data as any).food_order_items ?? []).map(
    (item: any): FoodOrderItem => ({
      id: item.id,
      menuItemId: item.menu_item_id,
      itemName: item.item_name,
      itemDescription: item.item_description,
      unitPrice: Number(item.unit_price),
      quantity: item.quantity,
      lineTotal: Number(item.line_total),
      vegType: foodVegTypeFromDb(item.veg_type) ?? FoodVegType.VEG,
      specialInstructions: item.special_instructions,
    })
  );
  return order;
}

export async function getPassengerFoodOrders(supabase: SupabaseClient): Promise<FoodOrder[]> {
  const { data, error } = await supabase.from("food_orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapOrderRow);
}

export async function getRestaurantFoodOrders(
  supabase: SupabaseClient,
  restaurantId: string,
  statuses?: string[]
): Promise<FoodOrder[]> {
  let query = supabase.from("food_orders").select("*, food_order_items(*)").eq("restaurant_id", restaurantId).order("created_at", { ascending: false });
  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const order = mapOrderRow(row);
    order.items = (row.food_order_items ?? []).map(
      (item: any): FoodOrderItem => ({
        id: item.id,
        menuItemId: item.menu_item_id,
        itemName: item.item_name,
        itemDescription: item.item_description,
        unitPrice: Number(item.unit_price),
        quantity: item.quantity,
        lineTotal: Number(item.line_total),
        vegType: foodVegTypeFromDb(item.veg_type) ?? FoodVegType.VEG,
        specialInstructions: item.special_instructions,
      })
    );
    return order;
  });
}

export async function restaurantAcceptOrder(supabase: SupabaseClient, orderId: string): Promise<void> {
  const { error } = await supabase.rpc("restaurant_accept_order", { p_order_id: orderId });
  if (error) throw error;
}

export async function restaurantRejectOrder(supabase: SupabaseClient, orderId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("restaurant_reject_order", { p_order_id: orderId, p_reason: reason });
  if (error) throw error;
}

export async function restaurantMarkPreparing(supabase: SupabaseClient, orderId: string): Promise<void> {
  const { error } = await supabase.rpc("restaurant_mark_preparing", { p_order_id: orderId });
  if (error) throw error;
}

export async function restaurantMarkReady(supabase: SupabaseClient, orderId: string): Promise<void> {
  const { error } = await supabase.rpc("restaurant_mark_ready", { p_order_id: orderId });
  if (error) throw error;
}

export async function passengerCancelFoodOrder(supabase: SupabaseClient, orderId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("passenger_cancel_food_order", { p_order_id: orderId, p_reason: reason ?? "Passenger cancelled" });
  if (error) throw error;
}

export async function submitFoodOrderRating(
  supabase: SupabaseClient,
  params: { orderId: string; rating: number; comment?: string; itemRatings?: Array<{ orderItemId: string; rating: number }> }
): Promise<void> {
  const { error } = await supabase.rpc("submit_food_order_rating", {
    p_order_id: params.orderId,
    p_rating: params.rating,
    p_comment: params.comment ?? null,
    p_item_ratings: params.itemRatings
      ? params.itemRatings.map((r) => ({ order_item_id: r.orderItemId, rating: r.rating }))
      : null,
  });
  if (error) throw error;
}

/** Online food payment — three-step flow mirrors payments.ts's ride payment functions exactly. */
export async function createPendingFoodOrderPayment(supabase: SupabaseClient, orderId: string) {
  const { data, error } = await supabase.rpc("create_pending_food_order_payment", { p_order_id: orderId });
  if (error) throw error;
  return data;
}

export async function attachFoodOrderPaymentOrder(supabase: SupabaseClient, paymentId: string, providerOrderId: string) {
  const { data, error } = await supabase.rpc("attach_food_order_payment_order", {
    p_payment_id: paymentId,
    p_provider_order_id: providerOrderId,
  });
  if (error) throw error;
  return data;
}

/**
 * service_role only (mark_food_order_payment_captured has no EXECUTE grant
 * for `authenticated` — see 20260914091300_food_payment_rpcs.sql). Call
 * only from a Route Handler, with getSupabaseAdminClient(), AFTER
 * independently verifying the gateway signature — mirrors
 * markRidePaymentCaptured exactly, including the required
 * providerOrderId cross-check argument.
 */
export async function markFoodOrderPaymentCaptured(
  supabase: SupabaseClient,
  paymentId: string,
  providerPaymentId: string,
  providerOrderId: string
) {
  const { data, error } = await supabase.rpc("mark_food_order_payment_captured", {
    p_payment_id: paymentId,
    p_provider_payment_id: providerPaymentId,
    p_provider_order_id: providerOrderId,
  });
  if (error) throw error;
  return data;
}

export async function getFoodOrderPayment(supabase: SupabaseClient, orderId: string) {
  const { data, error } = await supabase.rpc("get_food_order_payment", { p_order_id: orderId });
  if (error) throw error;
  return data;
}

/** Advances the pull-based food matching heartbeat — the Restaurant/Passenger tracking screen calls this on a short interval while an order is ready_for_pickup, mirroring advanceMatching() for rides. */
export async function advanceFoodOrderMatching(supabase: SupabaseClient, orderId: string): Promise<string> {
  const { data, error } = await supabase.rpc("advance_food_order_matching", { p_order_id: orderId });
  if (error) throw error;
  return data as string;
}

export function subscribeToFoodOrder(supabase: SupabaseClient, orderId: string, onChange: (row: any) => void) {
  const channel = freshChannel(supabase, `food-order:${orderId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "food_orders", filter: `id=eq.${orderId}` },
      (payload) => onChange(payload.new)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToRestaurantOrders(supabase: SupabaseClient, restaurantId: string, onChange: () => void) {
  const channel = freshChannel(supabase, `restaurant-orders:${restaurantId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "food_orders", filter: `restaurant_id=eq.${restaurantId}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
