"use client";

import * as React from "react";
import { Button, Card, StatusPill, PageLoader, EmptyState, ConfirmDialog } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getRestaurantFoodOrders,
  subscribeToRestaurantOrders,
  restaurantAcceptOrder,
  restaurantRejectOrder,
  restaurantMarkPreparing,
  restaurantMarkReady,
} from "@ride-it/data";
import { type FoodOrder, FoodOrderStatus } from "@ride-it/types";
import { ClipboardList } from "lucide-react";
import { useRestaurant } from "../../../components/restaurant-context";

const STATUS_TONE: Record<string, "online" | "pending" | "alert" | "info" | "offline"> = {
  placed: "pending",
  accepted: "info",
  preparing: "info",
  ready_for_pickup: "online",
  driver_assigned: "online",
  picked_up: "online",
  out_for_delivery: "online",
  delivered: "online",
  cancelled: "offline",
  rejected: "alert",
  failed: "alert",
};

const TABS: Array<{ label: string; statuses?: string[] }> = [
  { label: "New", statuses: ["placed"] },
  { label: "In progress", statuses: ["accepted", "preparing", "ready_for_pickup", "driver_assigned", "picked_up", "out_for_delivery"] },
  { label: "Completed", statuses: ["delivered"] },
  { label: "Cancelled", statuses: ["cancelled", "rejected", "failed"] },
];

export default function OrdersPage() {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const { current, loading: loadingRestaurant } = useRestaurant();
  const [orders, setOrders] = React.useState<FoodOrder[] | null>(null);
  const [tab, setTab] = React.useState(0);
  const [rejectingId, setRejectingId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    if (!current) return;
    getRestaurantFoodOrders(supabase, current.id).then(setOrders);
  }, [supabase, current]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!current) return;
    return subscribeToRestaurantOrders(supabase, current.id, refresh);
  }, [supabase, current, refresh]);

  async function handleAccept(orderId: string) {
    setBusyId(orderId);
    try {
      await restaurantAcceptOrder(supabase, orderId);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(reason: string) {
    if (!rejectingId) return;
    setBusyId(rejectingId);
    try {
      await restaurantRejectOrder(supabase, rejectingId, reason);
      setRejectingId(null);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handlePreparing(orderId: string) {
    setBusyId(orderId);
    try {
      await restaurantMarkPreparing(supabase, orderId);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReady(orderId: string) {
    setBusyId(orderId);
    try {
      await restaurantMarkReady(supabase, orderId);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (loadingRestaurant || orders === null) return <PageLoader />;
  if (!current) return <EmptyState title="No restaurant found" />;

  const activeTabStatuses = TABS[tab]?.statuses;
  const filtered = activeTabStatuses ? orders.filter((o) => activeTabStatuses.includes(o.status.toLowerCase())) : orders;

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-bold text-ink">Orders</h1>

      <div className="mt-4 flex gap-2 border-b border-border">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setTab(i)}
            className={`border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === i ? "border-signal-blue text-signal-blue" : "border-transparent text-ink-soft"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState className="mt-8" icon={<ClipboardList size={22} />} title="No orders here" description="Orders will show up here as they come in." />
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {filtered.map((order) => (
            <Card key={order.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Order #{order.id.slice(0, 8)}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {order.recipientName} · {order.recipientPhone}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">{order.deliveryAddress}</p>
                </div>
                <div className="text-right">
                  <StatusPill tone={STATUS_TONE[order.status.toLowerCase()] ?? "info"}>{order.status.replace(/_/g, " ")}</StatusPill>
                  <p className="mt-1.5 font-meter text-sm font-bold text-ink">₹{order.totalAmount.toFixed(2)}</p>
                  <p className="text-xs text-ink-soft">{order.paymentMethod === "COD" ? "COD" : "Online"} · {order.paymentStatus}</p>
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                {(order.items ?? []).map((item) => (
                  <p key={item.id} className="text-xs text-ink-soft">
                    {item.quantity} × {item.itemName}
                  </p>
                ))}
              </div>

              {order.status === FoodOrderStatus.PLACED && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setRejectingId(order.id)} disabled={busyId === order.id}>
                    Reject
                  </Button>
                  <Button size="sm" loading={busyId === order.id} onClick={() => handleAccept(order.id)}>
                    Accept
                  </Button>
                </div>
              )}
              {order.status === FoodOrderStatus.ACCEPTED && (
                <Button size="sm" className="mt-3" loading={busyId === order.id} onClick={() => handlePreparing(order.id)}>
                  Start preparing
                </Button>
              )}
              {order.status === FoodOrderStatus.PREPARING && (
                <Button size="sm" className="mt-3" loading={busyId === order.id} onClick={() => handleReady(order.id)}>
                  Mark ready for pickup
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={rejectingId !== null}
        onOpenChange={(open) => !open && setRejectingId(null)}
        title="Reject this order?"
        description="The customer will be notified. This cannot be undone."
        confirmLabel="Reject order"
        tone="destructive"
        onConfirm={() => handleReject("Restaurant unable to fulfill order")}
        loading={busyId === rejectingId}
      />
    </main>
  );
}
