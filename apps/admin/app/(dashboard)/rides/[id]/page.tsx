"use client";

import * as React from "react";
import { Button, Card, CardHeader, CardTitle, ConfirmDialog, EmptyState, Input, Select, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getRideAdminDetail,
  listRideEvents,
  subscribeToRide,
  listSupportTicketsForRide,
  updateSupportTicketStatus,
  adminCancelRide,
  adminReassignRide,
  addAdminRideNote,
  listDriversAdmin,
  setDriverVerificationStatus,
  getRideTracking,
  getRidePayment,
  type AdminRideListRow,
  type RideEventRow,
  type SupportTicketRow,
  type AdminDriverListRow,
  type RideTrackingInfo,
  type PaymentRow,
} from "@ride-it/data";
import { RideMap } from "@ride-it/maps";
import { MessageSquare } from "lucide-react";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const STATUS_TONE: Record<string, "pending" | "info" | "online" | "alert"> = {
  requested: "pending",
  cancelled: "alert",
  ride_completed: "online",
  rated: "online",
};

const PAYMENT_STATUS_TONE: Record<string, "pending" | "info" | "online" | "alert" | "offline"> = {
  captured: "online",
  paid: "online",
  succeeded: "online",
  failed: "alert",
  pending: "pending",
  created: "pending",
  refunded: "info",
  not_selected: "offline",
};

export default function RideDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [ride, setRide] = React.useState<AdminRideListRow | null>(null);
  const [events, setEvents] = React.useState<RideEventRow[]>([]);
  const [tickets, setTickets] = React.useState<SupportTicketRow[]>([]);
  const [candidateDrivers, setCandidateDrivers] = React.useState<AdminDriverListRow[]>([]);
  const [tracking, setTracking] = React.useState<RideTrackingInfo | null>(null);
  const [payment, setPayment] = React.useState<PaymentRow | null>(null);
  const [refunding, setRefunding] = React.useState(false);
  const [refundError, setRefundError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [cancelReason, setCancelReason] = React.useState("");
  const [showCancel, setShowCancel] = React.useState(false);
  const [reassignTo, setReassignTo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmRefundOpen, setConfirmRefundOpen] = React.useState(false);
  const [confirmFlagOpen, setConfirmFlagOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [r, ev, tk] = await Promise.all([
      getRideAdminDetail(supabase, params.id),
      listRideEvents(supabase, params.id),
      listSupportTicketsForRide(supabase, params.id),
    ]);
    setRide(r);
    setEvents(ev);
    setTickets(tk);
    if (r) {
      const drivers = await listDriversAdmin(supabase, { status: "approved" });
      setCandidateDrivers(drivers.filter((d) => d.vehicle_type === r.vehicle_type && d.id !== r.driver_id));
    }
    // Admin authorization for get_ride_tracking() is enforced by the RPC
    // itself (is_admin() check) — same authorization model as every other
    // admin.ts query, not a new grant.
    try {
      setTracking(await getRideTracking(supabase, params.id));
    } catch {
      setTracking(null);
    }
    // get_ride_payment() returns null (not an error) when no online
    // payment was ever created for this ride (cash/driver_upi rides, or
    // an online ride whose checkout was never started) — an admin
    // viewing a cash ride correctly sees no payment record section.
    try {
      setPayment(await getRidePayment(supabase, params.id));
    } catch {
      setPayment(null);
    }
  }, [supabase, params.id]);

  React.useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Live updates for an active ride: a Realtime subscription on this one
  // ride row reacts immediately to a real status change, PLUS an
  // independent reconciliation poll so this screen never depends solely
  // on the WebSocket connection succeeding (this project has already hit
  // environments where Supabase Realtime fails to connect at all — plain
  // HTTPS via refresh() must still keep this screen current). Interval
  // matches the app's existing tracking-poll convention
  // (LOCATION_CONFIG.TRACKING_POLL_INTERVAL_MS, 10s) rather than
  // inventing a new cadence. Both stop once the ride reaches a terminal
  // state — nothing left to monitor, no reason to keep polling forever.
  const rideStatus = ride?.status;
  const isRideTerminal = rideStatus === "ride_completed" || rideStatus === "cancelled" || rideStatus === "rated";
  React.useEffect(() => {
    if (!rideStatus || isRideTerminal) return;
    const unsubscribe = subscribeToRide(supabase, params.id, () => {
      void refresh();
    });
    const interval = setInterval(() => {
      void refresh();
    }, 10_000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [supabase, params.id, refresh, rideStatus, isRideTerminal]);

  async function handleCancel() {
    if (!user || !cancelReason.trim()) return;
    setBusy(true);
    try {
      await adminCancelRide(supabase, params.id, user.id, cancelReason.trim());
      setShowCancel(false);
      setCancelReason("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleReassign() {
    if (!user || !reassignTo) return;
    setBusy(true);
    try {
      await adminReassignRide(supabase, params.id, user.id, reassignTo);
      setReassignTo("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNote() {
    if (!user || !note.trim()) return;
    setBusy(true);
    try {
      await addAdminRideNote(supabase, params.id, user.id, note.trim());
      setNote("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveTicket(ticketId: string) {
    setBusy(true);
    try {
      await updateSupportTicketStatus(supabase, ticketId, "resolved");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleFlagDriver() {
    if (!ride?.driver_id) return;
    setBusy(true);
    try {
      await setDriverVerificationStatus(supabase, ride.driver_id, "in_review", `Flagged from ride #${ride.id.slice(0, 8)} dispute`);
      setConfirmFlagOpen(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRefund() {
    if (!payment) return;
    setRefunding(true);
    setRefundError(null);
    try {
      const res = await fetch("/api/payments/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Includes the honest "no gateway configured" 503 — this
        // environment has no real Razorpay credentials, so this button
        // is architecturally real but has never actually moved money.
        // See PHASE_11_PAYMENTS_FINANCIAL_INTEGRITY_REVIEW.md.
        setRefundError(data.error ?? "Refund failed");
        return;
      }
      setConfirmRefundOpen(false);
      await refresh();
    } catch (e) {
      setRefundError(e instanceof Error ? e.message : "Refund failed");
    } finally {
      setRefunding(false);
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

  if (!ride) {
    return <p className="text-sm text-ink-soft">Ride not found.</p>;
  }

  const isTerminal = ride.status === "ride_completed" || ride.status === "cancelled" || ride.status === "rated";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Ride #{ride.id.slice(0, 8)}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {ride.pickup_address ?? "Pickup"} → {ride.drop_address ?? "Drop"} · {ride.vehicle_type === "auto" ? "Auto" : "Bike"}
          </p>
        </div>
        <StatusPill tone={STATUS_TONE[ride.status] ?? "info"}>{ride.status.replace("_", " ")}</StatusPill>
      </div>

      <RideMap
        pickup={tracking?.pickup}
        drop={tracking?.drop}
        driverLocation={tracking?.driverLocation}
        fallbackVariant="route"
        className="mt-4 h-48"
      />

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Trip details</CardTitle>
          </CardHeader>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-soft">Passenger</dt><dd className="text-ink">{ride.passenger_name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Driver</dt><dd className="text-ink">{ride.driver_name ?? "Unassigned"}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Fare</dt><dd className="font-meter text-ink">₹{ride.total_fare}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Payment method</dt><dd className="text-ink">{ride.payment_method ?? "Not selected"}</dd></div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Payment status</dt>
              <dd>
                <StatusPill tone={PAYMENT_STATUS_TONE[ride.payment_status] ?? "info"} dot={false}>
                  {ride.payment_status}
                </StatusPill>
              </dd>
            </div>
            {payment && (
              <>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Gateway status</dt>
                  <dd>
                    <StatusPill tone={PAYMENT_STATUS_TONE[payment.status] ?? "info"} dot={false}>
                      {payment.status}
                    </StatusPill>
                  </dd>
                </div>
                <div className="flex justify-between"><dt className="text-ink-soft">Gateway reference</dt><dd className="text-ink">{payment.provider_payment_id ?? payment.provider_order_id ?? "—"}</dd></div>
                {payment.captured_at && (
                  <div className="flex justify-between"><dt className="text-ink-soft">Captured</dt><dd className="text-ink">{formatDateTime(payment.captured_at)}</dd></div>
                )}
                {payment.refunded_at && (
                  <div className="flex justify-between"><dt className="text-ink-soft">Refunded</dt><dd className="text-ink">₹{payment.refunded_amount} on {formatDateTime(payment.refunded_at)}</dd></div>
                )}
              </>
            )}
            <div className="flex justify-between"><dt className="text-ink-soft">Requested</dt><dd className="text-ink">{formatDateTime(ride.requested_at)}</dd></div>
            {ride.cancellation_reason && (
              <div className="flex justify-between"><dt className="text-ink-soft">Cancellation</dt><dd className="text-alert-red">{ride.cancellation_reason}</dd></div>
            )}
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Complaints</CardTitle>
          </CardHeader>
          {tickets.length === 0 ? (
            <EmptyState icon={<MessageSquare size={20} />} title="No complaints" description="No support tickets filed for this ride." />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {tickets.map((t) => (
                <div key={t.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-ink">{t.subject}</p>
                    <StatusPill tone={t.status === "open" ? "alert" : "online"} dot={false}>{t.status}</StatusPill>
                  </div>
                  {t.description && <p className="mt-1 text-xs text-ink-soft">{t.description}</p>}
                  {t.status !== "resolved" && t.status !== "closed" && (
                    <button onClick={() => handleResolveTicket(t.id)} disabled={busy} className="mt-1 text-xs font-medium text-signal-blue">
                      Mark resolved
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Ride event history</CardTitle>
        </CardHeader>
        {events.length === 0 ? (
          <p className="text-sm text-ink-soft">No events recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {events.map((e) => (
              <div key={e.id} className="py-2 text-xs">
                <span className="font-medium text-ink">{e.event_type.replace(/_/g, " ")}</span>{" "}
                <span className="text-ink-soft">by {e.actor_type} · {formatDateTime(e.created_at)}</span>
                {e.payload && Object.keys(e.payload).length > 0 && (
                  <p className="mt-0.5 text-ink-soft">{JSON.stringify(e.payload)}</p>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-end gap-2">
          <Input
            size="sm"
            className="flex-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add an internal note"
          />
          <Button size="sm" variant="outline" disabled={!note.trim() || busy} onClick={handleAddNote}>
            Add note
          </Button>
        </div>
      </Card>

      {!isTerminal && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Reassign driver</CardTitle>
          </CardHeader>
          {candidateDrivers.length === 0 ? (
            <p className="text-sm text-ink-soft">No other approved {ride.vehicle_type} drivers available.</p>
          ) : (
            <div className="flex items-end gap-2">
              <Select
                size="sm"
                className="flex-1"
                aria-label="Reassign to driver"
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
              >
                <option value="">Select a driver…</option>
                {candidateDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name ?? d.id.slice(0, 8)}
                  </option>
                ))}
              </Select>
              <Button size="sm" disabled={!reassignTo || busy} onClick={handleReassign}>
                Reassign
              </Button>
            </div>
          )}
        </Card>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {payment?.status === "captured" ? (
          <div className="flex flex-col gap-1">
            <Button variant="outline" disabled={refunding} onClick={() => setConfirmRefundOpen(true)}>
              {refunding ? "Processing refund…" : "Issue refund"}
            </Button>
            {refundError && <p className="text-xs text-alert-red">{refundError}</p>}
          </div>
        ) : (
          <Button variant="outline" disabled title="Only a captured Ride It Online payment can be refunded from here">
            Issue refund
          </Button>
        )}
        {ride.driver_id && (
          <Button variant="outline" disabled={busy} onClick={() => setConfirmFlagOpen(true)}>
            Flag driver for review
          </Button>
        )}
        {!isTerminal &&
          (showCancel ? (
            <div className="flex items-end gap-2">
              <Input
                size="sm"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Cancellation reason"
              />
              <Button size="sm" variant="destructive" disabled={!cancelReason.trim() || busy} onClick={handleCancel}>
                Confirm cancel
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCancel(false)}>
                Back
              </Button>
            </div>
          ) : (
            <Button variant="destructive" onClick={() => setShowCancel(true)}>
              Cancel ride
            </Button>
          ))}
      </div>

      <ConfirmDialog
        open={confirmRefundOpen}
        onOpenChange={setConfirmRefundOpen}
        title="Issue refund?"
        description={`This refunds ₹${ride.total_fare} to the passenger for ride #${ride.id.slice(0, 8)}. This cannot be undone.`}
        confirmLabel="Issue refund"
        tone="destructive"
        loading={refunding}
        onConfirm={handleRefund}
      />
      <ConfirmDialog
        open={confirmFlagOpen}
        onOpenChange={setConfirmFlagOpen}
        title="Flag driver for review?"
        description="This sets the driver's verification status to 'in review', which may block them from going online until an admin clears the flag."
        confirmLabel="Flag driver"
        loading={busy}
        onConfirm={handleFlagDriver}
      />
    </div>
  );
}
