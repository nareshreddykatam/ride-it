"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, IndianRupee, Clock, ChefHat, CheckCircle2, XCircle } from "lucide-react";
import { StatCard, StatusPill, Card, Button, Skeleton, Switch } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getRestaurantDashboardSummary, updateRestaurant, getCurrentRestaurantSubscription } from "@ride-it/data";
import { RestaurantStatus } from "@ride-it/types";
import { useRestaurant } from "../../../components/restaurant-context";

const STATUS_COPY: Record<RestaurantStatus, { title: string; body: string; tone: "pending" | "alert" }> = {
  [RestaurantStatus.PENDING_VERIFICATION]: {
    title: "Application submitted",
    body: "Ridora is reviewing your restaurant. This usually takes 1-2 business days.",
    tone: "pending",
  },
  [RestaurantStatus.IN_REVIEW]: { title: "Under review", body: "An admin is currently reviewing your application.", tone: "pending" },
  [RestaurantStatus.REJECTED]: { title: "Application rejected", body: "", tone: "alert" },
  [RestaurantStatus.SUSPENDED]: { title: "Restaurant suspended", body: "", tone: "alert" },
  [RestaurantStatus.APPROVED]: { title: "", body: "", tone: "pending" },
};

export default function RestaurantDashboardPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const { current, loading: loadingRestaurant, refresh } = useRestaurant();
  const [summary, setSummary] = React.useState<Awaited<ReturnType<typeof getRestaurantDashboardSummary>> | null>(null);
  const [hasActiveSubscription, setHasActiveSubscription] = React.useState<boolean | null>(null);
  const [togglingOpen, setTogglingOpen] = React.useState(false);

  React.useEffect(() => {
    if (!current) return;
    getRestaurantDashboardSummary(supabase, current.id).then(setSummary);
    getCurrentRestaurantSubscription(supabase, current.id).then((sub) => setHasActiveSubscription(!!sub));
  }, [supabase, current]);

  async function handleToggleOpen(checked: boolean) {
    if (!current) return;
    setTogglingOpen(true);
    try {
      await updateRestaurant(supabase, current.id, { isOpen: checked });
      refresh();
    } finally {
      setTogglingOpen(false);
    }
  }

  if (loadingRestaurant) {
    return (
      <main className="p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-6 h-32 w-full" />
      </main>
    );
  }

  if (!current) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <Card className="max-w-md text-center">
          <p className="text-sm font-semibold text-ink">No restaurant found</p>
          <Button className="mt-4" onClick={() => router.push("/onboarding")}>
            Register a restaurant
          </Button>
        </Card>
      </main>
    );
  }

  const isLive = current.status === RestaurantStatus.APPROVED && hasActiveSubscription;

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{current.name}</h1>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusPill tone={isLive ? "verified" : current.status === RestaurantStatus.APPROVED ? "alert" : "pending"}>
              {isLive ? "Live" : current.status.replace(/_/g, " ")}
            </StatusPill>
            {current.status === RestaurantStatus.APPROVED && hasActiveSubscription === false && (
              <span className="text-xs text-alert-red-text">Subscription required to go live</span>
            )}
          </div>
        </div>
        {current.status === RestaurantStatus.APPROVED && (
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-ink-soft">{current.isOpen ? "Accepting orders" : "Closed"}</span>
            <Switch checked={current.isOpen} onCheckedChange={handleToggleOpen} disabled={togglingOpen} />
          </div>
        )}
      </div>

      {current.status !== RestaurantStatus.APPROVED && (
        <Card className="mt-5" accent={STATUS_COPY[current.status].tone === "alert" ? "red" : "marigold"}>
          <p className="text-sm font-semibold text-ink">{STATUS_COPY[current.status].title}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {current.status === RestaurantStatus.REJECTED
              ? current.rejectionReason
              : current.status === RestaurantStatus.SUSPENDED
                ? current.suspendedReason
                : STATUS_COPY[current.status].body}
          </p>
        </Card>
      )}

      {current.status === RestaurantStatus.APPROVED && hasActiveSubscription === false && (
        <Card className="mt-5" accent="marigold">
          <p className="text-sm font-semibold text-ink">Activate your subscription to go live</p>
          <p className="mt-1 text-sm text-ink-soft">Your restaurant is approved but needs an active subscription before it can receive orders.</p>
          <Button className="mt-3" onClick={() => router.push("/subscription")}>
            View plans
          </Button>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Today's orders" value={String(summary?.todays_orders ?? 0)} icon={ShoppingBag} tone="blue" />
        <StatCard label="Today's revenue" value={`₹${summary?.todays_revenue ?? 0}`} icon={IndianRupee} tone="green" />
        <StatCard label="Pending" value={String(summary?.pending_orders ?? 0)} icon={Clock} tone="marigold" />
        <StatCard label="Preparing" value={String(summary?.preparing_orders ?? 0)} icon={ChefHat} tone="blue" />
        <StatCard label="Ready for pickup" value={String(summary?.ready_orders ?? 0)} icon={CheckCircle2} tone="green" />
        <StatCard label="Delivered today" value={String(summary?.delivered_orders ?? 0)} icon={CheckCircle2} tone="green" />
        <StatCard label="Cancelled today" value={String(summary?.cancelled_orders ?? 0)} icon={XCircle} tone="red" />
      </div>

      <Button className="mt-6" variant="outline" onClick={() => router.push("/orders")}>
        View all orders
      </Button>
    </main>
  );
}
