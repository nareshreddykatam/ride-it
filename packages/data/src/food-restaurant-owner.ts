import type { SupabaseClient } from "@supabase/supabase-js";
import { RestaurantStatus, FoodVegType, foodVegTypeToDb, type RestaurantAnalytics } from "@ride-it/types";
import { uploadFile } from "@ride-it/supabase";

/** Mirrors ensure_driver_profile()/ensure_passenger_profile() — called once by the Restaurant app right after sign-up/login. */
export async function ensureRestaurantOwnerProfile(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("ensure_restaurant_owner_profile");
  if (error) throw error;
}

export interface OwnedRestaurant {
  id: string;
  name: string;
  status: RestaurantStatus;
  isOpen: boolean;
  address: string;
  rating: number;
  totalRatings: number;
  totalOrders: number;
  logoPath: string | null;
  coverImagePath: string | null;
  rejectionReason: string | null;
  suspendedReason: string | null;
}

function mapRestaurantRow(row: any): OwnedRestaurant {
  return {
    id: row.id,
    name: row.name,
    status: row.status.toUpperCase() as RestaurantStatus,
    isOpen: row.is_open,
    address: row.address,
    rating: Number(row.rating),
    totalRatings: row.total_ratings,
    totalOrders: row.total_orders,
    logoPath: row.logo_path,
    coverImagePath: row.cover_image_path,
    rejectionReason: row.rejection_reason,
    suspendedReason: row.suspended_reason,
  };
}

export async function getMyRestaurants(supabase: SupabaseClient): Promise<OwnedRestaurant[]> {
  const { data, error } = await supabase.from("restaurants").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRestaurantRow);
}

/** Creates a new restaurant, always pending_verification (RLS enforces this — see restaurants_insert_own_owner). */
export async function createRestaurant(
  supabase: SupabaseClient,
  params: {
    name: string;
    description?: string;
    address: string;
    landmark?: string;
    lat: number;
    lng: number;
    phone: string;
    email?: string;
    avgPreparationMinutes?: number;
  }
): Promise<OwnedRestaurant> {
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error("Must be authenticated");

  const { data, error } = await supabase
    .from("restaurants")
    .insert({
      owner_id: ownerId,
      name: params.name,
      description: params.description ?? null,
      address: params.address,
      landmark: params.landmark ?? null,
      location: `SRID=4326;POINT(${params.lng} ${params.lat})`,
      phone: params.phone,
      email: params.email ?? null,
      avg_preparation_minutes: params.avgPreparationMinutes ?? 30,
      status: "pending_verification",
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRestaurantRow(data);
}

export async function updateRestaurant(
  supabase: SupabaseClient,
  restaurantId: string,
  updates: Partial<{ name: string; description: string; address: string; landmark: string; phone: string; email: string; isOpen: boolean; avgPreparationMinutes: number }>
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.address !== undefined) dbUpdates.address = updates.address;
  if (updates.landmark !== undefined) dbUpdates.landmark = updates.landmark;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.isOpen !== undefined) dbUpdates.is_open = updates.isOpen;
  if (updates.avgPreparationMinutes !== undefined) dbUpdates.avg_preparation_minutes = updates.avgPreparationMinutes;

  const { error } = await supabase.from("restaurants").update(dbUpdates).eq("id", restaurantId);
  if (error) throw error;
}

export async function submitRestaurantVerification(
  supabase: SupabaseClient,
  restaurantId: string,
  params: { businessLicenseNumber?: string; additionalInfo?: Record<string, unknown> }
): Promise<void> {
  const { error } = await supabase.from("restaurant_verification").upsert(
    {
      restaurant_id: restaurantId,
      business_license_number: params.businessLicenseNumber ?? null,
      additional_info: params.additionalInfo ?? {},
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "restaurant_id" }
  );
  if (error) throw error;
};

export async function uploadRestaurantLogo(supabase: SupabaseClient, restaurantId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${restaurantId}/logo.${ext}`;
  const result = await uploadFile(supabase as any, "restaurant-images", path, file, { upsert: true, contentType: file.type });
  await supabase.from("restaurants").update({ logo_path: result.path }).eq("id", restaurantId);
  return result.path;
}

export async function uploadRestaurantCover(supabase: SupabaseClient, restaurantId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${restaurantId}/cover.${ext}`;
  const result = await uploadFile(supabase as any, "restaurant-images", path, file, { upsert: true, contentType: file.type });
  await supabase.from("restaurants").update({ cover_image_path: result.path }).eq("id", restaurantId);
  return result.path;
}

export async function uploadMenuItemImage(supabase: SupabaseClient, restaurantId: string, menuItemId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${restaurantId}/${menuItemId}.${ext}`;
  const result = await uploadFile(supabase as any, "menu-item-images", path, file, { upsert: true, contentType: file.type });
  await supabase.from("restaurant_menu_items").update({ image_path: result.path }).eq("id", menuItemId);
  return result.path;
}

// ---------------------------------------------------------------------------
// Menu categories
// ---------------------------------------------------------------------------

export interface OwnerMenuCategory {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export async function getOwnerMenuCategories(supabase: SupabaseClient, restaurantId: string): Promise<OwnerMenuCategory[]> {
  const { data, error } = await supabase
    .from("restaurant_menu_categories")
    .select("id, name, display_order, is_active")
    .eq("restaurant_id", restaurantId)
    .order("display_order");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, name: row.name, displayOrder: row.display_order, isActive: row.is_active }));
}

export async function createMenuCategory(supabase: SupabaseClient, restaurantId: string, name: string, displayOrder = 0): Promise<string> {
  const { data, error } = await supabase
    .from("restaurant_menu_categories")
    .insert({ restaurant_id: restaurantId, name, display_order: displayOrder })
    .select("id")
    .single();
  if (error) throw error;
  return (data as any).id;
}

export async function updateMenuCategory(supabase: SupabaseClient, categoryId: string, updates: Partial<{ name: string; displayOrder: number; isActive: boolean }>): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  const { error } = await supabase.from("restaurant_menu_categories").update(dbUpdates).eq("id", categoryId);
  if (error) throw error;
}

export async function deleteMenuCategory(supabase: SupabaseClient, categoryId: string): Promise<void> {
  const { error } = await supabase.from("restaurant_menu_categories").delete().eq("id", categoryId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Menu items
// ---------------------------------------------------------------------------

export interface OwnerMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  vegType: FoodVegType;
  imagePath: string | null;
  isAvailable: boolean;
  isActive: boolean;
  displayOrder: number;
}

function mapOwnerMenuItemRow(row: any): OwnerMenuItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    vegType: row.veg_type === "veg" ? FoodVegType.VEG : FoodVegType.NON_VEG,
    imagePath: row.image_path,
    isAvailable: row.is_available,
    isActive: row.is_active,
    displayOrder: row.display_order,
  };
}

export async function getOwnerMenuItems(supabase: SupabaseClient, restaurantId: string): Promise<OwnerMenuItem[]> {
  const { data, error } = await supabase
    .from("restaurant_menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("display_order");
  if (error) throw error;
  return (data ?? []).map(mapOwnerMenuItemRow);
}

export async function createMenuItem(
  supabase: SupabaseClient,
  params: { restaurantId: string; categoryId: string; name: string; description?: string; price: number; vegType: FoodVegType; displayOrder?: number }
): Promise<OwnerMenuItem> {
  const { data, error } = await supabase
    .from("restaurant_menu_items")
    .insert({
      restaurant_id: params.restaurantId,
      category_id: params.categoryId,
      name: params.name,
      description: params.description ?? null,
      price: params.price,
      veg_type: foodVegTypeToDb(params.vegType),
      display_order: params.displayOrder ?? 0,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapOwnerMenuItemRow(data);
}

export async function updateMenuItem(
  supabase: SupabaseClient,
  itemId: string,
  updates: Partial<{ name: string; description: string; price: number; vegType: FoodVegType; isAvailable: boolean; isActive: boolean; displayOrder: number; categoryId: string }>
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.price !== undefined) dbUpdates.price = updates.price;
  if (updates.vegType !== undefined) dbUpdates.veg_type = foodVegTypeToDb(updates.vegType);
  if (updates.isAvailable !== undefined) dbUpdates.is_available = updates.isAvailable;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder;
  if (updates.categoryId !== undefined) dbUpdates.category_id = updates.categoryId;

  const { error } = await supabase.from("restaurant_menu_items").update(dbUpdates).eq("id", itemId);
  if (error) throw error;
}

export async function deleteMenuItem(supabase: SupabaseClient, itemId: string): Promise<void> {
  const { error } = await supabase.from("restaurant_menu_items").delete().eq("id", itemId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

export interface RestaurantSubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  durationDays: number;
  features: string[];
}

export async function getRestaurantSubscriptionPlans(supabase: SupabaseClient): Promise<RestaurantSubscriptionPlan[]> {
  const { data, error } = await supabase.from("restaurant_subscription_plans").select("*").eq("is_active", true).order("amount");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    amount: Number(row.amount),
    durationDays: row.duration_days,
    features: Array.isArray(row.features) ? row.features : [],
  }));
}

export async function getCurrentRestaurantSubscription(supabase: SupabaseClient, restaurantId: string) {
  const { data, error } = await supabase
    .from("restaurant_subscriptions")
    .select("*, restaurant_subscription_plans(name)")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createPendingRestaurantSubscriptionPayment(supabase: SupabaseClient, restaurantId: string, planId: string) {
  const { data, error } = await supabase.rpc("create_pending_restaurant_subscription_payment", {
    p_restaurant_id: restaurantId,
    p_plan_id: planId,
  });
  if (error) throw error;
  return data;
}

export async function attachRestaurantSubscriptionPaymentOrder(supabase: SupabaseClient, paymentId: string, providerOrderId: string) {
  const { data, error } = await supabase.rpc("attach_restaurant_subscription_payment_order", {
    p_payment_id: paymentId,
    p_provider_order_id: providerOrderId,
  });
  if (error) throw error;
  return data;
}

/**
 * service_role only (mark_restaurant_subscription_payment_captured has no
 * EXECUTE grant for `authenticated`). Call only from a Route Handler, with
 * getSupabaseAdminClient(), AFTER independently verifying the gateway
 * signature — mirrors markFoodOrderPaymentCaptured/markRidePaymentCaptured.
 */
export async function markRestaurantSubscriptionPaymentCaptured(
  supabase: SupabaseClient,
  paymentId: string,
  providerPaymentId: string,
  providerOrderId: string
) {
  const { data, error } = await supabase.rpc("mark_restaurant_subscription_payment_captured", {
    p_payment_id: paymentId,
    p_provider_payment_id: providerPaymentId,
    p_provider_order_id: providerOrderId,
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Dashboard + analytics
// ---------------------------------------------------------------------------

export async function getRestaurantDashboardSummary(supabase: SupabaseClient, restaurantId: string) {
  const { data, error } = await supabase.rpc("get_restaurant_dashboard_summary", { p_restaurant_id: restaurantId });
  if (error) throw error;
  return data as {
    todays_orders: number;
    todays_revenue: number;
    pending_orders: number;
    preparing_orders: number;
    ready_orders: number;
    delivered_orders: number;
    cancelled_orders: number;
  };
}

export async function getRestaurantAnalytics(
  supabase: SupabaseClient,
  restaurantId: string,
  from?: string,
  to?: string
): Promise<RestaurantAnalytics> {
  const { data, error } = await supabase.rpc("get_restaurant_analytics", {
    p_restaurant_id: restaurantId,
    p_from: from ?? undefined,
    p_to: to ?? undefined,
  });
  if (error) throw error;

  const raw = data as any;
  return {
    orderOverview: {
      totalOrders: raw.order_overview.total_orders,
      completedOrders: raw.order_overview.completed_orders,
      cancelledOrders: raw.order_overview.cancelled_orders,
      pendingOrders: raw.order_overview.pending_orders,
      totalRevenue: Number(raw.order_overview.total_revenue),
    },
    paymentMix: {
      cashOnDelivery: raw.payment_mix.cash_on_delivery,
      onlinePayment: raw.payment_mix.online_payment,
    },
    menuPerformance: {
      topSeller: raw.menu_performance.top_seller,
      revenueLeader: raw.menu_performance.revenue_leader,
      leastOrdered: raw.menu_performance.least_ordered,
      bestRated: raw.menu_performance.best_rated,
    },
    customerTrends: {
      repeatCustomers: raw.customer_trends.repeat_customers,
      averageOrderValue: Number(raw.customer_trends.average_order_value),
      ordersByDay: raw.customer_trends.orders_by_day ?? [],
    },
    ratingInsights: {
      averageRating: Number(raw.rating_insights.average_rating),
      totalRatings: raw.rating_insights.total_ratings,
      ratingDistribution: raw.rating_insights.rating_distribution ?? {},
    },
  };
}
