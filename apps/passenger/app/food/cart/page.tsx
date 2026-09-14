"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Minus, MapPin, User, Users } from "lucide-react";
import { Button, Input, Switch, PageLoader, EmptyState } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getCartSummary,
  updateCartItemQuantity,
  removeCartItem,
  createFoodOrder,
  listSavedPlaces,
  getPassengerProfile,
} from "@ride-it/data";
import { type CartItemSummary, FoodPaymentMethod } from "@ride-it/types";
import { getCurrentPositionOnce, fetchReverseGeocode, type LatLng } from "@ride-it/maps";
import { openRazorpayCheckout } from "@ride-it/payments/client-checkout";

export default function FoodCartPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [items, setItems] = React.useState<CartItemSummary[] | null>(null);
  const [isForSelf, setIsForSelf] = React.useState(true);
  const [recipientName, setRecipientName] = React.useState("");
  const [recipientPhone, setRecipientPhone] = React.useState("");
  const [deliveryAddress, setDeliveryAddress] = React.useState("");
  const [deliveryLandmark, setDeliveryLandmark] = React.useState("");
  const [deliveryLocation, setDeliveryLocation] = React.useState<LatLng | null>(null);
  const [paymentMethod, setPaymentMethod] = React.useState<FoodPaymentMethod>(FoodPaymentMethod.COD);
  const [placing, setPlacing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedPlaces, setSavedPlaces] = React.useState<Array<{ label: string; address: string; lat: number; lng: number }>>([]);

  const refresh = React.useCallback(() => {
    getCartSummary(supabase).then(setItems);
  }, [supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!user) return;
    getPassengerProfile(supabase, user.id).then((profile) => {
      if (profile?.full_name) setRecipientName(profile.full_name);
      if (profile?.phone) setRecipientPhone(profile.phone.replace(/^\+?91/, ""));
    });
    listSavedPlaces(supabase, user.id).then((places) =>
      setSavedPlaces(places.map((p) => ({ label: p.label, address: p.address, lat: p.lat, lng: p.lng })))
    );

    getCurrentPositionOnce().then(async (loc) => {
      if (!loc) return;
      setDeliveryLocation(loc);
      const reverse = await fetchReverseGeocode(loc.lat, loc.lng).catch(() => null);
      if (reverse?.formattedAddress) setDeliveryAddress(reverse.formattedAddress);
    });
  }, [supabase, user]);

  const subtotal = (items ?? []).reduce((sum, i) => sum + i.lineTotal, 0);
  const hasUnavailable = (items ?? []).some((i) => !i.isAvailable);

  function selectSavedPlace(place: { label: string; address: string; lat: number; lng: number }) {
    setDeliveryAddress(place.address);
    setDeliveryLocation({ lat: place.lat, lng: place.lng });
  }

  async function handleQuantityChange(item: CartItemSummary, delta: number) {
    const next = item.quantity + delta;
    if (next <= 0) {
      await removeCartItem(supabase, item.cartItemId);
    } else {
      await updateCartItemQuantity(supabase, item.cartItemId, next);
    }
    refresh();
  }

  async function handlePlaceOrder() {
    setError(null);
    if (!deliveryLocation) {
      setError("We need your delivery location. Please enable location access.");
      return;
    }
    if (!recipientPhone || !/^[6-9][0-9]{9}$/.test(recipientPhone)) {
      setError("A valid 10-digit recipient phone number is required.");
      return;
    }
    if (!recipientName.trim()) {
      setError("Recipient name is required.");
      return;
    }
    if (!deliveryAddress.trim()) {
      setError("Delivery address is required.");
      return;
    }

    setPlacing(true);
    try {
      const order = await createFoodOrder(supabase, {
        recipientName,
        recipientPhone,
        isForSelf,
        deliveryAddress,
        deliveryLandmark: deliveryLandmark || undefined,
        deliveryLat: deliveryLocation.lat,
        deliveryLng: deliveryLocation.lng,
        paymentMethod,
      });

      if (paymentMethod === FoodPaymentMethod.ONLINE) {
        const res = await fetch("/api/payments/food/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Couldn't start payment");

        await openRazorpayCheckout({
          keyId: payload.keyId,
          orderId: payload.orderId,
          amountInSmallestUnit: Math.round(payload.amount * 100),
          currency: payload.currency,
          name: "Ridora Food",
          description: `Order from ${order.restaurantName}`,
          prefillContact: recipientPhone,
          onSuccess: async (result) => {
            await fetch("/api/payments/food/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paymentId: payload.paymentId,
                providerOrderId: result.razorpay_order_id,
                providerPaymentId: result.razorpay_payment_id,
                signature: result.razorpay_signature,
              }),
            });
            router.push(`/food/order/${order.id}`);
          },
          onDismiss: () => setPlacing(false),
        });
        return;
      }

      router.push(`/food/order/${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't place order");
      setPlacing(false);
    }
  }

  if (items === null) return <PageLoader />;

  if (items.length === 0) {
    return (
      <main className="flex flex-1 flex-col bg-paper">
        <TopBar onBack={() => router.back()} title="Your Cart" />
        <EmptyState title="Your cart is empty" description="Add items from a restaurant to get started." />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-paper pb-8">
      <TopBar onBack={() => router.back()} title="Your Cart" />

      <div className="px-5 py-4">
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.cartItemId} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{item.itemName}</p>
                <p className="mt-0.5 font-meter text-sm text-ink-soft">₹{item.currentUnitPrice.toFixed(2)}</p>
                {!item.isAvailable && <p className="mt-1 text-xs font-medium text-alert-red-text">No longer available — remove to continue</p>}
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                <button onClick={() => handleQuantityChange(item, -1)} className="flex h-6 w-6 items-center justify-center text-ink">
                  <Minus size={14} />
                </button>
                <span className="w-4 text-center text-sm font-semibold text-ink">{item.quantity}</span>
                <button onClick={() => handleQuantityChange(item, 1)} className="flex h-6 w-6 items-center justify-center text-ink">
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-tint-blue/30 px-4 py-3">
          <span className="text-sm font-semibold text-ink">Subtotal</span>
          <span className="font-meter text-base font-bold text-ink">₹{subtotal.toFixed(2)}</span>
        </div>

        {/* Order for self / someone else */}
        <div className="mt-6">
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              {isForSelf ? <User size={16} className="text-signal-blue" /> : <Users size={16} className="text-signal-blue" />}
              <span className="text-sm font-medium text-ink">{isForSelf ? "Ordering for myself" : "Ordering for someone else"}</span>
            </div>
            <Switch checked={!isForSelf} onCheckedChange={(checked) => setIsForSelf(!checked)} label="Order for someone else" />
          </div>
        </div>

        {/* Recipient */}
        <div className="mt-4 flex flex-col gap-3">
          <Input
            label={isForSelf ? "Your name" : "Recipient name"}
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Full name"
          />
          <Input
            label={isForSelf ? "Your phone number" : "Recipient phone number"}
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="10-digit mobile number"
            hint="Required — the delivery partner will contact this number."
          />
        </div>

        {/* Delivery address */}
        <div className="mt-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Delivery address</p>
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-border bg-surface p-3">
            <MapPin size={16} className="mt-0.5 shrink-0 text-signal-blue" />
            <textarea
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              rows={2}
              placeholder="Enter delivery address"
              className="w-full resize-none bg-transparent text-sm text-ink outline-none"
            />
          </div>
          <Input
            className="mt-2"
            value={deliveryLandmark}
            onChange={(e) => setDeliveryLandmark(e.target.value)}
            placeholder="Landmark (optional)"
          />
          {savedPlaces.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {savedPlaces.map((place) => (
                <button
                  key={place.label}
                  onClick={() => selectSavedPlace(place)}
                  className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-signal-blue hover:text-signal-blue"
                >
                  {place.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Payment method */}
        <div className="mt-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Payment method</p>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <button
              onClick={() => setPaymentMethod(FoodPaymentMethod.COD)}
              className={`rounded-xl border p-3.5 text-center text-sm font-semibold transition-colors ${
                paymentMethod === FoodPaymentMethod.COD ? "border-signal-blue bg-tint-blue/40 text-signal-blue" : "border-border text-ink-soft"
              }`}
            >
              Cash on Delivery
            </button>
            <button
              onClick={() => setPaymentMethod(FoodPaymentMethod.ONLINE)}
              className={`rounded-xl border p-3.5 text-center text-sm font-semibold transition-colors ${
                paymentMethod === FoodPaymentMethod.ONLINE ? "border-signal-blue bg-tint-blue/40 text-signal-blue" : "border-border text-ink-soft"
              }`}
            >
              Pay Online
            </button>
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-medium text-alert-red-text">{error}</p>}

        <Button className="mt-6 w-full" size="lg" loading={placing} disabled={hasUnavailable} onClick={handlePlaceOrder}>
          Place order · ₹{subtotal.toFixed(2)}
        </Button>
      </div>
    </main>
  );
}

function TopBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur-sm">
      <button onClick={onBack} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-ink">
        <ArrowLeft size={18} />
      </button>
      <h1 className="font-display text-lg font-bold text-ink">{title}</h1>
    </div>
  );
}
