"use client";

import * as React from "react";
import { Card, StatCard, PageLoader, EmptyState } from "@ride-it/ui";
import { ShoppingBag, IndianRupee, Star, Users, TrendingUp } from "lucide-react";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getRestaurantAnalytics } from "@ride-it/data";
import { type RestaurantAnalytics } from "@ride-it/types";
import { useRestaurant } from "../../../components/restaurant-context";

export default function AnalyticsPage() {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const { current, loading: loadingRestaurant } = useRestaurant();
  const [analytics, setAnalytics] = React.useState<RestaurantAnalytics | null>(null);

  React.useEffect(() => {
    if (!current) return;
    getRestaurantAnalytics(supabase, current.id).then(setAnalytics);
  }, [supabase, current]);

  if (loadingRestaurant || !analytics) return <PageLoader />;
  if (!current) return <EmptyState title="No restaurant found" />;

  const hasOrders = analytics.orderOverview.totalOrders > 0;

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-bold text-ink">Analytics</h1>
      <p className="mt-1 text-sm text-ink-soft">Last 30 days</p>

      {!hasOrders ? (
        <EmptyState className="mt-8" icon={<ShoppingBag size={22} />} title="No orders yet" description="Analytics will appear once you start receiving orders." />
      ) : (
        <>
          <p className="mt-6 text-xs font-bold uppercase tracking-wide text-ink-soft">Order overview</p>
          <div className="mt-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total orders" value={String(analytics.orderOverview.totalOrders)} icon={ShoppingBag} tone="blue" />
            <StatCard label="Revenue" value={`₹${analytics.orderOverview.totalRevenue}`} icon={IndianRupee} tone="green" />
            <StatCard label="Completed" value={String(analytics.orderOverview.completedOrders)} icon={ShoppingBag} tone="green" />
            <StatCard label="Cancelled" value={String(analytics.orderOverview.cancelledOrders)} icon={ShoppingBag} tone="red" />
          </div>

          <p className="mt-8 text-xs font-bold uppercase tracking-wide text-ink-soft">Payment mix</p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <StatCard label="Cash on delivery" value={String(analytics.paymentMix.cashOnDelivery)} icon={IndianRupee} tone="marigold" />
            <StatCard label="Online payment" value={String(analytics.paymentMix.onlinePayment)} icon={IndianRupee} tone="blue" />
          </div>

          <p className="mt-8 text-xs font-bold uppercase tracking-wide text-ink-soft">Menu performance</p>
          <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
            <PerformanceCard label="Top Seller" data={analytics.menuPerformance.topSeller} valueKey="quantitySold" suffix=" sold" />
            <PerformanceCard label="Revenue Leader" data={analytics.menuPerformance.revenueLeader} valueKey="revenue" prefix="₹" />
            <PerformanceCard label="Best Rated" data={analytics.menuPerformance.bestRated} valueKey="avgRating" suffix=" ★" />
            <PerformanceCard label="Least Ordered" data={analytics.menuPerformance.leastOrdered} valueKey="quantitySold" suffix=" sold" />
          </div>

          <p className="mt-8 text-xs font-bold uppercase tracking-wide text-ink-soft">Customer trends</p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <StatCard label="Repeat customers" value={String(analytics.customerTrends.repeatCustomers)} icon={Users} tone="violet" />
            <StatCard label="Avg. order value" value={`₹${analytics.customerTrends.averageOrderValue}`} icon={TrendingUp} tone="blue" />
          </div>

          <p className="mt-8 text-xs font-bold uppercase tracking-wide text-ink-soft">Rating insights</p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <StatCard label="Average rating" value={analytics.ratingInsights.averageRating.toFixed(1)} icon={Star} tone="marigold" />
            <StatCard label="Total ratings" value={String(analytics.ratingInsights.totalRatings)} icon={Star} tone="blue" />
          </div>
        </>
      )}
    </main>
  );
}

function PerformanceCard({
  label,
  data,
  valueKey,
  prefix = "",
  suffix = "",
}: {
  label: string;
  data: Record<string, any> | null | undefined;
  valueKey: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</p>
      {data ? (
        <>
          <p className="mt-2 truncate text-sm font-semibold text-ink">{data.item_name ?? data.itemName}</p>
          <p className="mt-1 font-meter text-lg font-bold text-signal-blue">
            {prefix}
            {data[valueKey] ?? data[valueKey.replace(/([A-Z])/g, "_$1").toLowerCase()]}
            {suffix}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">Not enough data yet</p>
      )}
    </Card>
  );
}
