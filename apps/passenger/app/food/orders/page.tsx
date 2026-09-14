"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShoppingBag, ChevronRight } from "lucide-react";
import { EmptyState, PageLoader, StatusPill } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getPassengerFoodOrders } from "@ride-it/data";
import { type FoodOrder, FoodOrderStatus } from "@ride-it/types";

const STATUS_TONE: Partial<Record<FoodOrderStatus, "online" | "pending" | "alert" | "info" | "offline">> = {
  [FoodOrderStatus.DELIVERED]: "online",
  [FoodOrderStatus.CANCELLED]: "offline",
  [FoodOrderStatus.REJECTED]: "alert",
  [FoodOrderStatus.FAILED]: "alert",
};

export default function FoodOrdersHistoryPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [orders, setOrders] = React.useState<FoodOrder[] | null>(null);

  React.useEffect(() => {
    getPassengerFoodOrders(supabase).then(setOrders);
  }, [supabase]);

  if (orders === null) return <PageLoader />;

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-paper">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur-sm">
        <button onClick={() => router.push("/food")} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-ink">
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-lg font-bold text-ink">Your Orders</h1>
      </div>

      {orders.length === 0 ? (
        <EmptyState icon={<ShoppingBag size={22} />} title="No orders yet" description="Your food orders will show up here." />
      ) : (
        <div className="flex flex-col gap-2 px-5 py-4">
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => router.push(`/food/order/${order.id}`)}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{order.restaurantName}</p>
                <p className="mt-1 font-meter text-xs text-ink-soft">₹{order.totalAmount.toFixed(2)}</p>
                <div className="mt-1.5">
                  <StatusPill tone={STATUS_TONE[order.status] ?? "info"}>{order.status.replace(/_/g, " ")}</StatusPill>
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-ink-soft" />
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
