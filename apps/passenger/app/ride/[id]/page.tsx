"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, Phone, Share2, ShieldAlert, Users, Flag, X } from "lucide-react";
import { Button, Card, Skeleton, StatusPill } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getRide, cancelActiveRide, subscribeToRide, type RideRow } from "@ride-it/data";
import { getDriverProfile, type DriverProfileRow } from "@ride-it/data";
import { getRideTracking, subscribeToDriverLocationChanges, type RideTrackingInfo } from "@ride-it/data";
import { triggerSos, getAppSettingValue, createReport } from "@ride-it/data";
import { createRideShare, listTrustedContacts, type TrustedContactRow } from "@ride-it/data";
import { useAuth } from "@ride-it/auth";
import { RideMap, LOCATION_CONFIG, getCurrentPositionOnce } from "@ride-it/maps";

const STEPS: { status: RideRow["status"]; label: string }[] = [
  { status: "accepted", label: "Driver assigned" },
  { status: "driver_arriving", label: "Arriving" },
  { status: "ride_started", label: "On the way" },
];

function stepIndexForStatus(status: RideRow["status"]): number {
  const i = STEPS.findIndex((s) => s.status === status);
  if (i >= 0) return i;
  if (["ride_completed", "payment", "rated"].includes(status)) return STEPS.length - 1;
  return 0;
}

function isStale(updatedAt: string | null): boolean {
  if (!updatedAt) return true;
  const ageSeconds = (Date.now() - new Date(updatedAt).getTime()) / 1000;
  return ageSeconds > LOCATION_CONFIG.STALE_LOCATION_THRESHOLD_SECONDS;
}

type SafetyView = "menu" | "sos_confirm" | "sos_done" | "share" | "report";

export default function RideStatusPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [ride, setRide] = React.useState<RideRow | null>(null);
  const [driver, setDriver] = React.useState<DriverProfileRow | null>(null);
  const [tracking, setTracking] = React.useState<RideTrackingInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [cancelling, setCancelling] = React.useState(false);
  const navigatedRef = React.useRef(false);

  // Safety sheet state
  const [safetyOpen, setSafetyOpen] = React.useState(false);
  const [safetyView, setSafetyView] = React.useState<SafetyView>("menu");
  const [emergencyNumber, setEmergencyNumber] = React.useState<string | null>(null);
  const [triggeringSos, setTriggeringSos] = React.useState(false);
  const [contacts, setContacts] = React.useState<TrustedContactRow[]>([]);
  const [sharingWith, setSharingWith] = React.useState<string | null>(null);
  const [shareLink, setShareLink] = React.useState<string | null>(null);
  const [sharing, setSharing] = React.useState(false);
  const [reportDescription, setReportDescription] = React.useState("");
  const [submittingReport, setSubmittingReport] = React.useState(false);

  const loadDriver = React.useCallback(
    async (driverId: string) => {
      try {
        setDriver(await getDriverProfile(supabase, driverId));
      } catch {
        setDriver(null);
      }
    },
    [supabase]
  );

  const refreshTracking = React.useCallback(async () => {
    try {
      setTracking(await getRideTracking(supabase, params.id));
    } catch {
      // Not authorized / ride not found — leave tracking null, the map
      // falls back to the demo view rather than erroring the whole page.
    }
  }, [supabase, params.id]);

  React.useEffect(() => {
    let active = true;
    getRide(supabase, params.id)
      .then(async (r) => {
        if (!active) return;
        setRide(r);
        if (r?.driver_id) await loadDriver(r.driver_id);
      })
      .finally(() => active && setLoading(false));
    refreshTracking();
    getAppSettingValue(supabase, "emergency_contact_number")
      .then((v) => setEmergencyNumber(typeof v === "string" ? v : null))
      .catch(() => setEmergencyNumber(null));
    return () => {
      active = false;
    };
  }, [supabase, params.id, loadDriver, refreshTracking]);

  // Real ride-status updates via Realtime — no simulated timer.
  React.useEffect(() => {
    const unsubscribe = subscribeToRide(supabase, params.id, async (updated) => {
      setRide(updated);
      if (updated.driver_id && !driver) await loadDriver(updated.driver_id);
      if (!navigatedRef.current && (updated.status === "ride_completed" || updated.status === "payment")) {
        navigatedRef.current = true;
        router.push(`/ride/${params.id}/complete`);
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, params.id]);

  // Real driver-location updates: realtime signal (drivers table changed)
  // triggers a refetch via get_ride_tracking(), plus a periodic
  // reconciliation poll as a safety net if a realtime event is missed —
  // same heartbeat-plus-realtime pattern as Phase 8's matching screen.
  React.useEffect(() => {
    if (!ride?.driver_id) return;
    const unsubscribe = subscribeToDriverLocationChanges(supabase, ride.driver_id, refreshTracking);
    const interval = setInterval(refreshTracking, LOCATION_CONFIG.TRACKING_POLL_INTERVAL_MS);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [supabase, ride?.driver_id, refreshTracking]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelActiveRide(supabase, params.id, "Passenger cancelled");
      router.push("/home");
    } catch {
      setCancelling(false);
    }
  }

  function openSafety() {
    setSafetyView("menu");
    setSafetyOpen(true);
  }

  async function handleConfirmSos() {
    setTriggeringSos(true);
    try {
      const pos = await getCurrentPositionOnce();
      await triggerSos(supabase, {
        rideId: params.id,
        lat: pos?.lat,
        lng: pos?.lng,
      });
      setSafetyView("sos_done");
    } finally {
      setTriggeringSos(false);
    }
  }

  async function openShare() {
    if (!user) return;
    setSafetyView("share");
    setShareLink(null);
    setSharingWith(null);
    try {
      setContacts(await listTrustedContacts(supabase, user.id));
    } catch {
      setContacts([]);
    }
  }

  async function handleShare(contactId?: string) {
    setSharing(true);
    try {
      const { token } = await createRideShare(supabase, params.id, { trustedContactId: contactId, durationHours: 4 });
      setShareLink(`${window.location.origin}/shared/${token}`);
      setSharingWith(contactId ?? "link");
    } finally {
      setSharing(false);
    }
  }

  async function handleSubmitReport() {
    if (!user || !ride || !reportDescription.trim()) return;
    setSubmittingReport(true);
    try {
      await createReport(supabase, {
        userId: user.id,
        rideId: params.id,
        category: "driver_issue",
        subject: "Driver reported by passenger",
        description: reportDescription.trim(),
        reportedUserId: ride.driver_id ?? undefined,
      });
      setReportDescription("");
      setSafetyOpen(false);
    } finally {
      setSubmittingReport(false);
    }
  }

  const status = ride?.status ?? "accepted";
  const stepIndex = stepIndexForStatus(status);
  const progressPct = (stepIndex / (STEPS.length - 1)) * 100;
  const canCancel = status === "accepted";
  const driverStale = tracking?.driverLocationUpdatedAt ? isStale(tracking.driverLocationUpdatedAt) : false;

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="relative">
        <RideMap
          pickup={tracking?.pickup}
          drop={tracking?.drop}
          driverLocation={tracking?.driverLocation}
          driverLocationStale={driverStale}
          fallbackVariant="live"
          fallbackProgress={0.15 + stepIndex * 0.28}
          className="h-48"
        />
        <button
          onClick={openSafety}
          className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-alert-red px-3 py-1.5 text-xs font-medium text-white shadow-md"
        >
          <ShieldAlert size={13} /> Safety
        </button>
      </div>

      {tracking?.driverLocation && driverStale && (
        <p className="mt-2 text-xs text-marigold">
          Your driver&apos;s location hasn&apos;t updated recently — position shown may be outdated.
        </p>
      )}

      <div className="mt-6">
        <div className="h-1 w-full overflow-hidden rounded-full bg-ink/10">
          <motion.div
            className="h-full rounded-full bg-signal-blue"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <div className="mt-2 flex justify-between">
          {STEPS.map((step, i) => (
            <span key={step.status} className={`text-[11px] ${i <= stepIndex ? "text-signal-blue" : "text-ink-soft"}`}>
              {step.label}
            </span>
          ))}
        </div>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            {loading ? (
              <Skeleton className="h-5 w-32" />
            ) : (
              <>
                <p className="font-display text-base font-medium text-ink">{driver?.full_name ?? "Your driver"}</p>
                <p className="text-xs text-ink-soft">
                  {driver ? (driver.vehicle_type === "auto" ? "Auto" : "Bike") : ""}
                  {driver && driver.rating > 0 ? ` · ★ ${driver.rating.toFixed(1)}` : ""}
                  {tracking?.distanceToPickupMeters != null && status === "accepted"
                    ? ` · ${(tracking.distanceToPickupMeters / 1000).toFixed(1)} km away`
                    : ""}
                </p>
              </>
            )}
          </div>
          <StatusPill tone="online">{STEPS[stepIndex]?.label ?? "In progress"}</StatusPill>
        </div>
      </Card>

      {(status === "driver_arriving" || status === "ride_started") && (
        <Card className="mt-4">
          <p className="text-sm text-ink">
            {status === "driver_arriving"
              ? "Tell your driver your Ride PIN to start the ride."
              : "Ride PIN verified — enjoy your ride."}
          </p>
          {status === "driver_arriving" && <p className="mt-1 text-xs text-ink-soft">Forgot it? Check your Ride PIN in Profile.</p>}
        </Card>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-6">
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="text-center text-sm font-medium text-alert-red disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel ride"}
          </button>
        )}
        <p className="text-center text-xs text-ink-soft">This screen updates automatically as your ride progresses.</p>
      </div>

      {safetyOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-6 pb-8"
          onClick={() => setSafetyOpen(false)}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-md rounded-xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-medium text-ink">
                {safetyView === "menu" && "Safety"}
                {safetyView === "sos_confirm" && "Confirm SOS"}
                {safetyView === "sos_done" && "SOS recorded"}
                {safetyView === "share" && "Share this ride"}
                {safetyView === "report" && "Report an issue"}
              </p>
              <button onClick={() => setSafetyOpen(false)} className="text-ink-soft">
                <X size={18} />
              </button>
            </div>

            {safetyView === "menu" && (
              <div className="mt-4 flex flex-col gap-2">
                <Button variant="destructive" className="w-full justify-start" onClick={() => setSafetyView("sos_confirm")}>
                  <AlertTriangle size={16} className="mr-2" /> SOS / Emergency
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={openShare}>
                  <Share2 size={16} className="mr-2" /> Share this ride
                </Button>
                <Link href="/trusted-contacts">
                  <Button variant="outline" className="w-full justify-start">
                    <Users size={16} className="mr-2" /> Trusted contacts
                  </Button>
                </Link>
                <Button variant="outline" className="w-full justify-start" onClick={() => setSafetyView("report")}>
                  <Flag size={16} className="mr-2" /> Report an issue
                </Button>
                {emergencyNumber && (
                  <a href={`tel:${emergencyNumber}`}>
                    <Button variant="outline" className="w-full justify-start">
                      <Phone size={16} className="mr-2" /> Call emergency ({emergencyNumber})
                    </Button>
                  </a>
                )}
              </div>
            )}

            {safetyView === "sos_confirm" && (
              <div className="mt-2 text-center">
                <AlertTriangle size={28} className="mx-auto text-alert-red" />
                <p className="mt-3 text-sm text-ink">
                  This will record a safety event with our team and your approximate location. Only confirm if you
                  need help.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setSafetyView("menu")}>
                    Cancel
                  </Button>
                  <Button variant="destructive" className="flex-1" disabled={triggeringSos} onClick={handleConfirmSos}>
                    {triggeringSos ? "Sending…" : "Confirm SOS"}
                  </Button>
                </div>
              </div>
            )}

            {safetyView === "sos_done" && (
              <div className="mt-2 text-center">
                <p className="text-sm text-ink">Here&apos;s exactly what happened:</p>
                <ul className="mt-3 space-y-2 text-left text-sm text-ink-soft">
                  <li>✓ A safety event was recorded with your ride and approximate location.</li>
                  <li>✓ Ride It&apos;s safety team has been notified and will review it.</li>
                  <li>✓ You can still share this ride or call emergency services directly.</li>
                </ul>
                <p className="mt-3 text-xs text-alert-red">
                  Ride It has not contacted police or emergency services on your behalf. If you are in immediate
                  danger, call {emergencyNumber ?? "your local emergency number"} directly.
                </p>
                <Button className="mt-4 w-full" onClick={() => setSafetyOpen(false)}>
                  Done
                </Button>
              </div>
            )}

            {safetyView === "share" && (
              <div className="mt-3">
                {!shareLink ? (
                  <>
                    <p className="text-xs text-ink-soft">
                      Share your live ride status — pickup, destination, driver, and vehicle — with a trusted
                      contact. The link expires in 4 hours or when the ride ends, whichever comes first.
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                      {contacts.map((c) => (
                        <Button
                          key={c.id}
                          variant="outline"
                          className="w-full justify-start"
                          disabled={sharing}
                          onClick={() => handleShare(c.id)}
                        >
                          {c.name}
                        </Button>
                      ))}
                      <Button variant="outline" className="w-full" disabled={sharing} onClick={() => handleShare()}>
                        {sharing ? "Creating link…" : "Just create a link"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <p className="text-sm text-ink">
                      {sharingWith && sharingWith !== "link" ? "Shared with your contact." : "Link created."}
                    </p>
                    <div className="mt-2 break-all rounded-lg bg-ink/5 p-3 text-xs text-ink-soft">{shareLink}</div>
                    <Button
                      className="mt-3 w-full"
                      onClick={() => {
                        navigator.clipboard?.writeText(shareLink);
                      }}
                    >
                      Copy link
                    </Button>
                  </div>
                )}
              </div>
            )}

            {safetyView === "report" && (
              <div className="mt-3">
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="What happened?"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-white p-3 text-sm text-ink outline-none focus:border-signal-blue"
                />
                <Button className="mt-3 w-full" disabled={!reportDescription.trim() || submittingReport} onClick={handleSubmitReport}>
                  {submittingReport ? "Submitting…" : "Submit report"}
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </main>
  );
}
