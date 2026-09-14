import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartItemSummary } from "@ride-it/types";

/** Distinct errcode raised by add_to_cart() when the item belongs to a different restaurant than the caller's existing cart (see 20260914090600_food_cart.sql). Callers should catch this specifically to show a "clear cart and start a new order?" confirmation rather than a generic error toast. */
export const CART_DIFFERENT_RESTAURANT_ERRCODE = "RIDF1";

export function isDifferentRestaurantCartError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as any).code === CART_DIFFERENT_RESTAURANT_ERRCODE;
}

export async function addToCart(
  supabase: SupabaseClient,
  params: { menuItemId: string; quantity: number; specialInstructions?: string }
): Promise<string> {
  const { data, error } = await supabase.rpc("add_to_cart", {
    p_menu_item_id: params.menuItemId,
    p_quantity: params.quantity,
    p_special_instructions: params.specialInstructions ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function updateCartItemQuantity(supabase: SupabaseClient, cartItemId: string, quantity: number): Promise<void> {
  const { error } = await supabase.rpc("update_cart_item_quantity", { p_cart_item_id: cartItemId, p_quantity: quantity });
  if (error) throw error;
}

export async function removeCartItem(supabase: SupabaseClient, cartItemId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_cart_item", { p_cart_item_id: cartItemId });
  if (error) throw error;
}

export async function clearCart(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("clear_cart");
  if (error) throw error;
}

/**
 * Always re-prices from the LIVE menu item price (see get_cart_summary's
 * migration comment) — the UI should trust this over any locally-cached
 * total, since checkout itself re-derives the price again anyway.
 */
export async function getCartSummary(supabase: SupabaseClient): Promise<CartItemSummary[]> {
  const { data, error } = await supabase.rpc("get_cart_summary");
  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    cartId: row.cart_id,
    restaurantId: row.restaurant_id,
    cartItemId: row.cart_item_id,
    menuItemId: row.menu_item_id,
    itemName: row.item_name,
    quantity: row.quantity,
    currentUnitPrice: Number(row.current_unit_price),
    lineTotal: Number(row.line_total),
    isAvailable: row.is_available,
    specialInstructions: row.special_instructions,
  }));
}
