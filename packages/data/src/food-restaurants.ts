import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type Restaurant,
  type RestaurantSummary,
  type MenuItem,
  type FoodCategory,
  FoodVegType,
  RestaurantStatus,
  foodVegTypeFromDb,
} from "@ride-it/types";

/**
 * Restaurant discovery + menu retrieval. Distance/radius are always
 * server-computed (get_nearby_restaurants, migration
 * 20260914091200_food_order_rpcs.sql) — this layer never filters or
 * re-sorts by a client-computed distance.
 */
export async function getNearbyRestaurants(
  supabase: SupabaseClient,
  params: { lat: number; lng: number; categoryId?: string; search?: string; limit?: number; offset?: number }
): Promise<RestaurantSummary[]> {
  const { data, error } = await supabase.rpc("get_nearby_restaurants", {
    p_lat: params.lat,
    p_lng: params.lng,
    p_category_id: params.categoryId ?? null,
    p_search: params.search ?? null,
    p_limit: params.limit ?? 20,
    p_offset: params.offset ?? 0,
  });
  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    id: row.restaurant_id,
    name: row.name,
    logoPath: row.logo_path,
    coverImagePath: row.cover_image_path,
    rating: Number(row.rating),
    totalRatings: row.total_ratings,
    avgPreparationMinutes: row.avg_preparation_minutes,
    distanceKm: Number(row.distance_km),
    isOpen: row.is_open,
  }));
}

export async function getFoodCategories(supabase: SupabaseClient): Promise<FoodCategory[]> {
  const { data, error } = await supabase
    .from("food_categories")
    .select("id, name, slug, icon, display_order")
    .eq("is_active", true)
    .order("display_order");
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    displayOrder: row.display_order,
  }));
}

export async function getRestaurantDetail(supabase: SupabaseClient, restaurantId: string): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(
      "id, name, description, status, address, landmark, phone, email, is_open, rating, total_ratings, avg_preparation_minutes, logo_path, cover_image_path, restaurant_categories(food_categories(id, name, slug, icon, display_order))"
    )
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as any;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status.toUpperCase() as RestaurantStatus,
    address: row.address,
    landmark: row.landmark,
    phone: row.phone,
    email: row.email,
    isOpen: row.is_open,
    rating: Number(row.rating),
    totalRatings: row.total_ratings,
    avgPreparationMinutes: row.avg_preparation_minutes,
    distanceKm: 0,
    logoPath: row.logo_path,
    coverImagePath: row.cover_image_path,
    location: { lat: 0, lng: 0 },
    categories: (row.restaurant_categories ?? []).map((rc: any) => ({
      id: rc.food_categories.id,
      name: rc.food_categories.name,
      slug: rc.food_categories.slug,
      icon: rc.food_categories.icon,
      displayOrder: rc.food_categories.display_order,
    })),
  };
}

export async function getRestaurantMenu(supabase: SupabaseClient, restaurantId: string): Promise<MenuItem[]> {
  const { data, error } = await supabase.rpc("get_restaurant_menu", { p_restaurant_id: restaurantId });
  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    id: row.item_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryDisplayOrder: row.category_display_order,
    name: row.item_name,
    description: row.item_description,
    price: Number(row.price),
    vegType: foodVegTypeFromDb(row.veg_type) ?? FoodVegType.VEG,
    imagePath: row.image_path,
    isAvailable: row.is_available,
    displayOrder: row.item_display_order,
  }));
}
