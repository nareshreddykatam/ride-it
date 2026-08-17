"use client";

import * as React from "react";
import { Button, Card, CardHeader, CardTitle, ConfirmDialog, EmptyState, Skeleton, StatusPill } from "@ride-it/ui";
import { Star } from "lucide-react";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getPassengerAdminDetail,
  setPassengerActive,
  listSupportTicketsForUser,
  listReviewsReceived,
  type SupportTicketRow,
  type RatingRow,
} from "@ride-it/data";
import { listPassengerRides, type RideRow } from "@ride-it/data";
import { MessageSquare } from "lucide-react";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function PassengerDetailPage({ params }: { params: { id: string } }) {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [passenger, setPassenger] = React.useState<Awaited<ReturnType<typeof getPassengerAdminDetail>>>(null);
  const [rides, setRides] = React.useState<RideRow[]>([]);
  const [tickets, setTickets] = React.useState<SupportTicketRow[]>([]);
  const [reviews, setReviews] = React.useState<RatingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState(false);
  const [confirmSuspendOpen, setConfirmSuspendOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [p, r, t, revs] = await Promise.all([
      getPassengerAdminDetail(supabase, params.id),
      listPassengerRides(supabase, params.id, 10),
      listSupportTicketsForUser(supabase, params.id),
      listReviewsReceived(supabase, params.id, 10),
    ]);
    setPassenger(p);
    setRides(r);
    setTickets(t);
    setReviews(revs);
  }, [supabase, params.id]);

  React.useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function handleToggleActive() {
    if (!passenger) return;
    setUpdating(true);
    try {
      await setPassengerActive(supabase, params.id, !passenger.is_active);
      setConfirmSuspendOpen(false);
      await refresh();
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-40 rounded-lg" />
      </div>
    );
  }

  if (!passenger) {
    return <p className="text-sm text-ink-soft">Passenger not found.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">{passenger.full_name ?? "Unnamed passenger"}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Passenger ID: {params.id} · {passenger.phone ? `+91 ${passenger.phone}` : "—"}
          </p>
        </div>
        <StatusPill tone={passenger.is_active ? "online" : "alert"}>{passenger.is_active ? "Active" : "Suspended"}</StatusPill>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-xs text-ink-soft">Rating</p>
          <p className="mt-1 flex items-center gap-1 font-meter text-lg text-ink">
            {passenger.rating > 0 ? (
              <>
                <Star size={16} className="fill-marigold text-marigold" aria-hidden="true" />
                {passenger.rating.toFixed(1)}
              </>
            ) : (
              "—"
            )}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-ink-soft">Total rides</p>
          <p className="mt-1 font-meter text-lg text-ink">{passenger.total_rides}</p>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent reviews</CardTitle>
        </CardHeader>
        {reviews.length === 0 ? (
          <p className="text-sm text-ink-soft">No reviews yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {reviews.map((r) => (
              <div key={r.id} className="py-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-meter text-sm text-ink">
                    <Star size={13} className="fill-marigold text-marigold" aria-hidden="true" />
                    {r.rating}
                  </span>
                  <span className="text-xs text-ink-soft">{new Date(r.created_at).toLocaleDateString("en-IN")}</span>
                </div>
                {r.comment && <p className="mt-1 text-xs text-ink-soft">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Ride history</CardTitle>
        </CardHeader>
        {rides.length === 0 ? (
          <p className="text-sm text-ink-soft">No rides yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {rides.map((ride) => (
              <div key={ride.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="text-ink">
                    {ride.pickup_address ?? "Pickup"} → {ride.drop_address ?? "Drop"}
                  </p>
                  <p className="text-xs text-ink-soft">{formatDate(ride.requested_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-meter text-ink">₹{ride.total_fare}</span>
                  <StatusPill tone={ride.status === "cancelled" ? "alert" : "online"} dot={false}>
                    {ride.status}
                  </StatusPill>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Complaints</CardTitle>
        </CardHeader>
        {tickets.length === 0 ? (
          <EmptyState icon={<MessageSquare size={20} />} title="No complaints" description="No support tickets filed by this passenger." />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {tickets.map((t) => (
              <div key={t.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="text-ink">{t.subject}</p>
                  <StatusPill tone={t.status === "open" ? "alert" : "online"} dot={false}>
                    {t.status}
                  </StatusPill>
                </div>
                <p className="mt-1 text-xs text-ink-soft">{formatDate(t.created_at)} · {t.category}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6">
        <Button
          variant={passenger.is_active ? "destructive" : "outline"}
          disabled={updating}
          onClick={() => (passenger.is_active ? setConfirmSuspendOpen(true) : handleToggleActive())}
        >
          {passenger.is_active ? "Suspend passenger" : "Reactivate passenger"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmSuspendOpen}
        onOpenChange={setConfirmSuspendOpen}
        title="Suspend this passenger?"
        description="They won't be able to book new rides until an admin reactivates their account."
        confirmLabel="Suspend passenger"
        tone="destructive"
        loading={updating}
        onConfirm={handleToggleActive}
      />
    </div>
  );
}
