"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, Phone } from "lucide-react";
import { Button, PageLoader, StarRating, StatusPill } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getFoodOrder,
  subscribeToFoodOrder,
  advanceFoodOrderMatching,
  passengerCancelFoodOrder,
  submitFoodOrderRating,
} from "@ride-it/data";
import { type FoodOrder, FoodOrderStatus } from "@ride-it/types";

const STATUS_LABEL: Record<FoodOrderStatus, string> = {
  [FoodOrderStatus.PLACED]: "Order placed",
  [FoodOrderStatus.ACCEPTED]: "Restaurant accepted your order",
  [FoodOrderStatus.PREPARING]: "Preparing your food",
  [FoodOrderStatus.READY_FOR_PICKUP]: "Ready — finding a delivery partner",
  [FoodOrderStatus.DRIVER_ASSIGNED]: "Delivery partner assigned",
  [FoodOrderStatus.PICKED_UP]: "Order picked up",
  [FoodOrderStatus.OUT_FOR_DELIVERY]: "Out for delivery",
  [FoodOrderStatus.DELIVERED]: "Delivered",
  [FoodOrderStatus.CANCELLED]: "Cancelled",
  [FoodOrderStatus.REJECTED]: "Rejected by restaurant",
  [FoodOrderStatus.FAILED]: "Failed",
};

const STEPS = [
  FoodOrderStatus.PLACED,
  FoodOrderStatus.ACCEPTED,
  FoodOrderStatus.PREPARING,
  FoodOrderStatus.READY_FOR_PICKUP,
  FoodOrderStatus.OUT_FOR_DELIVERY,
  FoodOrderStatus.DELIVERED,
];

export default function FoodOrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [order, setOrder] = React.useState<FoodOrder | null>(null);
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [ratingSubmitted, setRatingSubmitted] = React.useState(false);
  const [submittingRating, setSubmittingRating] = React.useState(false);

  const refresh = React.useCallback(() => {
    getFoodOrder(supabase, params.id).then(setOrder);
  }, [supabase, params.id]);

  React.useEffect(() => {
    refresh();
    const unsubscribe = subscribeToFoodOrder(supabase, params.id, () => refresh());
    return unsubscribe;
  }, [supabase, params.id, refresh]);

  // Pull-based matching heartbeat, same pattern as ride matching — only
  // ticks while the order is actually ready_for_pickup (advance_food_
  // order_matching() is a no-op, returning immediately, at any other
  // status).
  React.useEffect(() => {
    if (order?.status !== FoodOrderStatus.READY_FOR_PICKUP) return;
    const interval = setInterval(() => {
      advanceFoodOrderMatching(supabase, params.id).catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [supabase, params.id, order?.status]);

  if (!order) return <PageLoader />;

  const canCancel = order.status === FoodOrderStatus.PLACED;
  const currentStepIndex = STEPS.indexOf(order.status);
  const isTerminalFailure = [FoodOrderStatus.CANCELLED, FoodOrderStatus.REJECTED, FoodOrderStatus.FAILED].includes(order.status);

  async function handleCancel() {
    await passengerCancelFoodOrder(supabase, order!.id);
    refresh();
  }

  async function handleSubmitRating() {
    setSubmittingRating(true);
    try {
      await submitFoodOrderRating(supabase, { orderId: order!.id, rating, comment: comment || undefined });
      setRatingSubmitted(true);
    } finally {
      setSubmittingRating(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-paper pb-8">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur-sm">
        <button onClick={() => router.push("/food")} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-ink">
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-lg font-bold text-ink">{order.restaurantName}</h1>
      </div>

      <div className="px-5 py-4">
        {isTerminalFailure ? (
          <div className="rounded-xl border border-alert-red/30 bg-alert-red/5 p-4">
            <p className="text-sm font-semibold text-alert-red-text">{STATUS_LABEL[order.status]}</p>
            {order.cancellationReason && <p className="mt-1 text-xs text-ink-soft">{order.cancellationReason}</p>}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              {order.status === FoodOrderStatus.DELIVERED ? (
                <CheckCircle2 size={18} className="text-meter-green" />
              ) : (
                <Clock size={18} className="text-signal-blue" />
              )}
              <p className="text-sm font-bold text-ink">{STATUS_LABEL[order.status]}</p>
            </div>
            <div className="mt-4 flex items-center gap-1">
              {STEPS.map((step, i) => (
                <div key={step} className={`h-1.5 flex-1 rounded-full ${i <= currentStepIndex ? "bg-signal-blue" : "bg-ink/10"}`} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Delivery to</p>
          <p className="mt-1 text-sm font-semibold text-ink">{order.recipientName}</p>
          <p className="text-sm text-ink-soft">{order.deliveryAddress}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
            <Phone size={12} /> {order.recipientPhone}
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Order summary</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {(order.items ?? []).map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-ink">
                  {item.quantity} × {item.itemName}
                </span>
                <span className="font-meter text-ink">₹{item.lineTotal.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-border pt-3 text-sm text-ink-soft">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>₹{order.subtotalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery fee</span>
              <span>₹{order.deliveryFee.toFixed(2)}</span>
            </div>
            <div className="mt-1 flex justify-between font-bold text-ink">
              <span>Total</span>
              <span className="font-meter">₹{order.totalAmount.toFixed(2)}</span>
            </div>
          </div>
          <div className="mt-2">
            <StatusPill tone={order.paymentStatus === "PAID" ? "verified" : "pending"}>
              {order.paymentMethod === "COD" ? "Cash on Delivery" : "Paid Online"} · {order.paymentStatus}
            </StatusPill>
          </div>
        </div>

        {canCancel && (
          <Button variant="outline" className="mt-4 w-full" onClick={handleCancel}>
            Cancel order
          </Button>
        )}

        {order.status === FoodOrderStatus.DELIVERED && !ratingSubmitted && (
          <div className="mt-4 rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-ink">Rate your order</p>
            <div className="mt-2 flex justify-center">
              <StarRating value={rating} onChange={setRating} />
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Leave a comment (optional)"
              rows={2}
              className="mt-3 w-full resize-none rounded-lg border border-border bg-transparent p-2.5 text-sm text-ink outline-none"
            />
            <Button className="mt-3 w-full" disabled={rating === 0} loading={submittingRating} onClick={handleSubmitRating}>
              Submit rating
            </Button>
          </div>
        )}

        {ratingSubmitted && <p className="mt-4 text-center text-sm font-medium text-meter-green-text">Thanks for your feedback!</p>}
      </div>
    </main>
  );
}
