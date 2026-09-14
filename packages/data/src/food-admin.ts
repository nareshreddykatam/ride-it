import type { SupabaseClient } from "@supabase/supabase-js";
import { RestaurantStatus } from "@ride-it/types";

/** Admin Food administration — restaurant applications/approval, subscriptions, orders, all gated by is_admin() at the RPC/RLS layer, re-checked server-side regardless of what the Admin UI shows. */

export async function getRestaurantApplications(supabase: SupabaseClient, status?: RestaurantStatus) {
  let query = supabase
    .from("restaurants")
    .select("*, restaurant_owners(users(full_name, phone, email)), restaurant_verification(*)")
    .order("created_at", { ascending: false });
  if (status) {
    query = query.eq("status", status.toLowerCase());
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function adminSetRestaurantStatus(
  supabase: SupabaseClient,
  restaurantId: string,
  status: RestaurantStatus,
  notes?: string
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_restaurant_status", {
    p_restaurant_id: restaurantId,
    p_status: status.toLowerCase(),
    p_notes: notes ?? null,
  });
  if (error) throw error;
}

export async function getRestaurantStatusHistory(supabase: SupabaseClient, restaurantId: string) {
  const { data, error } = await supabase
    .from("restaurant_status_history")
    .select("*, admin_users(users(full_name))")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function adminGrantRestaurantSubscription(
  supabase: SupabaseClient,
  restaurantId: string,
  planId: string,
  reason?: string
) {
  const { data, error } = await supabase.rpc("admin_grant_restaurant_subscription", {
    p_restaurant_id: restaurantId,
    p_plan_id: planId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data;
}

export async function getAllRestaurantSubscriptions(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("restaurant_subscriptions")
    .select("*, restaurants(name), restaurant_subscription_plans(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createRestaurantSubscriptionPlan(
  supabase: SupabaseClient,
  params: { name: string; description?: string; amount: number; durationDays: number; features?: string[] }
) {
  const { data, error } = await supabase
    .from("restaurant_subscription_plans")
    .insert({
      name: params.name,
      description: params.description ?? null,
      amount: params.amount,
      duration_days: params.durationDays,
      features: params.features ?? [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateRestaurantSubscriptionPlan(
  supabase: SupabaseClient,
  planId: string,
  updates: Partial<{ name: string; description: string; amount: number; durationDays: number; features: string[]; isActive: boolean }>
) {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
  if (updates.durationDays !== undefined) dbUpdates.duration_days = updates.durationDays;
  if (updates.features !== undefined) dbUpdates.features = updates.features;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  const { error } = await supabase.from("restaurant_subscription_plans").update(dbUpdates).eq("id", planId);
  if (error) throw error;
}

export async function getAllFoodOrdersForAdmin(supabase: SupabaseClient, limit = 100) {
  const { data, error } = await supabase
    .from("food_orders")
    .select("*, restaurants(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function adminCancelFoodOrder(supabase: SupabaseClient, orderId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_cancel_food_order", { p_order_id: orderId, p_reason: reason });
  if (error) throw error;
}

export async function getFoodDeliveryDriversStatus(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, work_mode, is_online, verification_status, users(full_name, phone)")
    .eq("work_mode", "food");
  if (error) throw error;
  return data;
}

export async function getFoodCategoriesForAdmin(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("food_categories").select("*").order("display_order");
  if (error) throw error;
  return data;
}

export async function createFoodCategory(supabase: SupabaseClient, params: { name: string; slug: string; icon?: string; displayOrder?: number }) {
  const { error } = await supabase.from("food_categories").insert({
    name: params.name,
    slug: params.slug,
    icon: params.icon ?? null,
    display_order: params.displayOrder ?? 0,
  });
  if (error) throw error;
}
