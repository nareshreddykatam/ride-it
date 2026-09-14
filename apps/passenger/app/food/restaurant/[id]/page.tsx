"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Star, Clock, Plus, Minus, ShoppingBag } from "lucide-react";
import { Button, Card, ConfirmDialog, PageLoader, EmptyState } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getPublicUrl } from "@ride-it/supabase/storage";
import {
  getRestaurantDetail,
  getRestaurantMenu,
  addToCart,
  getCartSummary,
  clearCart,
  isDifferentRestaurantCartError,
} from "@ride-it/data";
import { type Restaurant, type MenuItem, type CartItemSummary, FoodVegType } from "@ride-it/types";

export default function RestaurantDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [restaurant, setRestaurant] = React.useState<Restaurant | null>(null);
  const [menu, setMenu] = React.useState<MenuItem[] | null>(null);
  const [cart, setCart] = React.useState<CartItemSummary[]>([]);
  const [pendingItem, setPendingItem] = React.useState<MenuItem | null>(null);
  const [busyItemId, setBusyItemId] = React.useState<string | null>(null);

  const refreshCart = React.useCallback(() => {
    getCartSummary(supabase).then(setCart);
  }, [supabase]);

  React.useEffect(() => {
    getRestaurantDetail(supabase, params.id).then(setRestaurant);
    getRestaurantMenu(supabase, params.id).then(setMenu);
    refreshCart();
  }, [supabase, params.id, refreshCart]);

  const cartQuantity = (menuItemId: string) => cart.find((c) => c.menuItemId === menuItemId)?.quantity ?? 0;
  const cartTotal = cart.reduce((sum, c) => sum + c.lineTotal, 0);
  const cartItemCount = cart.reduce((sum, c) => sum + c.quantity, 0);
  const cartBelongsHere = cart.length === 0 || cart[0]?.restaurantId === params.id;

  async function handleAdd(item: MenuItem) {
    setBusyItemId(item.id);
    try {
      await addToCart(supabase, { menuItemId: item.id, quantity: 1 });
      refreshCart();
    } catch (err) {
      if (isDifferentRestaurantCartError(err)) {
        setPendingItem(item);
      } else {
        throw err;
      }
    } finally {
      setBusyItemId(null);
    }
  }

  async function confirmClearAndAdd() {
    if (!pendingItem) return;
    setBusyItemId(pendingItem.id);
    await clearCart(supabase);
    await addToCart(supabase, { menuItemId: pendingItem.id, quantity: 1 });
    setPendingItem(null);
    setBusyItemId(null);
    refreshCart();
  }

  if (!restaurant || !menu) return <PageLoader />;

  const coverUrl = restaurant.coverImagePath ? getPublicUrl(supabase, "restaurant-images", restaurant.coverImagePath) : null;
  const categories = Array.from(new Set(menu.map((m) => m.categoryId))).map((id) => menu.find((m) => m.categoryId === id)!);

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-paper pb-24">
      <div className="relative h-48 w-full shrink-0 bg-tint-blue">
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={restaurant.name} className="h-full w-full object-cover" />
        )}
        <button
          onClick={() => router.back()}
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface/95 text-ink shadow-md backdrop-blur-md"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      <div className="px-5 py-4">
        <h1 className="font-display text-xl font-bold text-ink">{restaurant.name}</h1>
        {restaurant.description && <p className="mt-1 text-sm text-ink-soft">{restaurant.description}</p>}
        <div className="mt-2 flex items-center gap-4 text-xs text-ink-soft">
          <span className="flex items-center gap-1">
            <Star size={13} className="fill-marigold text-marigold" />
            <span className="font-medium text-ink">{restaurant.rating.toFixed(1)}</span> ({restaurant.totalRatings})
          </span>
          <span className="flex items-center gap-1">
            <Clock size={13} />
            {restaurant.avgPreparationMinutes} min
          </span>
        </div>
        {!restaurant.isOpen && (
          <div className="mt-3 rounded-lg bg-alert-red/10 px-3 py-2 text-xs font-medium text-alert-red-text">
            This restaurant is currently closed.
          </div>
        )}
      </div>

      {categories.length === 0 && (
        <EmptyState icon={<ShoppingBag size={22} />} title="Menu coming soon" description="This restaurant hasn't added any items yet." />
      )}

      {categories.map((cat) => (
        <div key={cat.categoryId} className="px-5 py-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">{cat.categoryName}</h2>
          <div className="mt-2 flex flex-col gap-3">
            {menu
              .filter((m) => m.categoryId === cat.categoryId)
              .map((item) => (
                <Card key={item.id} className="flex gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-3 w-3 shrink-0 rounded-sm border ${
                          item.vegType === FoodVegType.VEG ? "border-meter-green" : "border-alert-red"
                        }`}
                      >
                        <span
                          className={`m-[2px] block h-1.5 w-1.5 rounded-full ${
                            item.vegType === FoodVegType.VEG ? "bg-meter-green" : "bg-alert-red"
                          }`}
                        />
                      </span>
                      <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                    </div>
                    {item.description && <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{item.description}</p>}
                    <p className="mt-1.5 font-meter text-sm font-semibold text-ink">₹{item.price.toFixed(2)}</p>
                    {!item.isAvailable && <p className="mt-1 text-xs font-medium text-alert-red-text">Currently unavailable</p>}
                  </div>
                  <div className="flex shrink-0 items-end">
                    {cartQuantity(item.id) > 0 ? (
                      <div className="flex items-center gap-2 rounded-lg border border-signal-blue px-2 py-1.5">
                        <button
                          onClick={() => handleAdd(item)}
                          disabled={busyItemId === item.id}
                          className="flex h-6 w-6 items-center justify-center text-signal-blue"
                          aria-label="Add one more"
                        >
                          <Plus size={14} />
                        </button>
                        <span className="w-4 text-center text-sm font-semibold text-ink">{cartQuantity(item.id)}</span>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!item.isAvailable || !restaurant.isOpen || busyItemId === item.id}
                        loading={busyItemId === item.id}
                        onClick={() => handleAdd(item)}
                      >
                        Add
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
          </div>
        </div>
      ))}

      {cartItemCount > 0 && cartBelongsHere && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <button
            onClick={() => router.push("/food/cart")}
            className="flex w-full items-center justify-between rounded-xl bg-signal-blue px-5 py-4 text-white shadow-lg active:scale-[0.98]"
          >
            <span className="text-sm font-semibold">
              {cartItemCount} item{cartItemCount > 1 ? "s" : ""} · ₹{cartTotal.toFixed(2)}
            </span>
            <span className="text-sm font-bold">View cart</span>
          </button>
        </div>
      )}

      <ConfirmDialog
        open={pendingItem !== null}
        onOpenChange={(open) => !open && setPendingItem(null)}
        title="Start a new order?"
        description="Your cart contains items from another restaurant. Clear cart and start a new order?"
        confirmLabel="Clear cart"
        tone="destructive"
        onConfirm={confirmClearAndAdd}
        loading={busyItemId === pendingItem?.id}
      />
    </main>
  );
}
