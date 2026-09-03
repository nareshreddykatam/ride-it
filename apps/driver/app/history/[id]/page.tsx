"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Star } from "lucide-react";
import { Card, Skeleton, StatusPill, VEHICLE_VISUALS } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getRide, getRideParticipantName, getOwnRatingForRide, type RideRow, type RatingRow } from "@ride-it/data";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  driver_upi: "Driver UPI",
  online: "Ridora Online",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function DriverRideReceiptPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [ride, setRide] = React.useState<RideRow | null>(null);
  const [passengerName, setPassengerName] = React.useState<string | null>(null);
  const [rating, setRating] = React.useState<RatingRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const r = await getRide(supabase, params.id);
        if (!active) return;
        if (!r) {
          setError("This ride couldn't be found.");
          return;
        }
        setRide(r);
        getRideParticipantName(supabase, params.id)
          .then((name) => active && setPassengerName(name))
          .catch(() => {});
        getOwnRatingForRide(supabase, params.id, user.id)
          .then((own) => active && setRating(own))
          .catch(() => {});
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Couldn't load this ride.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, params.id, user]);

  const visual = ride ? VEHICLE_VISUALS[ride.vehicle_type] : null;
  const VehicleIcon = visual?.icon;

  return (
    <main className="flex-1 px-6 py-8">
      <div className="flex items-center gap-2">
        <Link href="/history" aria-label="Back" className="-m-2.5 p-2.5 text-ink-soft">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-medium text-ink">Trip receipt</h1>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error || !ride ? (
        <p className="mt-6 text-sm text-alert-red">{error ?? "This ride couldn't be found."}</p>
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          <Card tone="elevated">
            <div className="flex items-center gap-3">
              {VehicleIcon && (
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: visual!.tintVar, color: visual!.colorVar }}
                >
                  <VehicleIcon size={22} strokeWidth={1.7} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{visual?.label ?? ride.vehicle_type}</p>
                <p className="text-xs text-ink-soft">{formatDateTime(ride.requested_at)}</p>
              </div>
              <StatusPill tone={ride.status === "cancelled" ? "alert" : "online"} dot={false}>
                {ride.status === "cancelled"
                  ? "Cancelled"
                  : ["ride_started", "destination_reached", "payment_collected"].includes(ride.status)
                    ? "In progress"
                    : "Completed"}
              </StatusPill>
            </div>
          </Card>

          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Route</p>
            <div className="mt-2 flex flex-col gap-1.5 text-sm text-ink">
              <p className="truncate">
                <span className="text-ink-soft">From </span>
                {ride.pickup_address ?? "Pickup"}
              </p>
              <p className="truncate">
                <span className="text-ink-soft">To </span>
                {ride.drop_address ?? "Destination"}
              </p>
            </div>
            {passengerName && (
              <p className="mt-2 text-xs text-ink-soft">
                Passenger: <span className="text-ink">{passengerName}</span>
              </p>
            )}
          </Card>

          {ride.status === "cancelled" ? (
            <Card className="border-alert-red/30 bg-alert-red/5">
              <p className="text-xs font-semibold uppercase tracking-wide text-alert-red-text">Cancelled</p>
              <p className="mt-1 text-sm text-ink">
                {ride.cancelled_by === "driver" ? "Cancelled by you" : ride.cancelled_by === "passenger" ? "Cancelled by passenger" : "Cancelled"}
              </p>
              {ride.cancellation_reason && <p className="mt-1 text-xs text-ink-soft">{ride.cancellation_reason}</p>}
              <p className="mt-1 text-xs text-ink-soft">{formatDateTime(ride.cancelled_at)}</p>
            </Card>
          ) : (
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Fare collected</p>
              <div className="mt-2 flex items-center justify-between font-medium text-ink">
                <span>Total</span>
                <span className="tabular-nums">₹{ride.total_fare}</span>
              </div>
              <p className="mt-1 text-xs text-meter-green-text">100% retained · 0% commission</p>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
                <span className="text-ink-soft">Payment method</span>
                <span className="text-ink">{ride.payment_method ? PAYMENT_METHOD_LABEL[ride.payment_method] ?? ride.payment_method : "—"}</span>
              </div>
            </Card>
          )}

          {rating && (
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your rating of this passenger</p>
              <div className="mt-2 flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    className={i < rating.rating ? "fill-marigold text-marigold" : "text-ink-soft"}
                    aria-hidden="true"
                  />
                ))}
              </div>
              {rating.comment && <p className="mt-2 text-xs text-ink-soft">&ldquo;{rating.comment}&rdquo;</p>}
            </Card>
          )}
        </div>
      )}
    </main>
  );
}
