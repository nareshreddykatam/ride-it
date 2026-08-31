"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Flag, MapPinOff, MessageCircle, Phone, Users, X } from "lucide-react";
import { BottomSheet, Button, Card, MeterValue, OtpInput, Select, Skeleton, StatusPill, PinGlyph, SafetyIcon, SlideToAction } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getRide,
  markDriverArriving,
  verifyRidePinAndStart,
  completeRide,
  getRideTracking,
  updateDriverLocation,
  triggerSos,
  getAppSettingValue,
  createReport,
  getMatchedPassengerContact,
  cancelRideByDriver,
  subscribeToRide,
  DRIVER_REPORT_REASONS,
  DRIVER_CANCELLATION_REASONS,
  formatCancellationReason,
  type RideRow,
  type RideTrackingInfo,
  type MatchedPassengerContact,
} from "@ride-it/data";
import { RideMap, watchDriverLocation, getCurrentPositionOnce, getExternalNavigationUrl, type GeolocationErrorReason } from "@ride-it/maps";

type Phase = "TO_PICKUP" | "VERIFY_PIN" | "TO_DROP" | "SUMMARY" | "CANCELLED_BY_PASSENGER" | "CANCELLED_BY_DRIVER";
type SafetyView = "menu" | "sos_confirm" | "sos_done" | "report";

const LOCATION_ERROR_MESSAGE: Record<GeolocationErrorReason, string> = {
  permission_denied: "Location permission required for live tracking.",
  position_unavailable: "Unable to update location right now.",
  timeout: "Location is taking longer than usual to update.",
  not_supported: "This device/browser doesn't support live location.",
};

function NavigationPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const rideId = params.get("rideId");
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [ride, setRide] = React.useState<RideRow | null>(null);
  const [tracking, setTracking] = React.useState<RideTrackingInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [phase, setPhase] = React.useState<Phase>("TO_PICKUP");
  const [pin, setPin] = React.useState("");
  const [pinError, setPinError] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [locationError, setLocationError] = React.useState<GeolocationErrorReason | null>(null);
  const [selfLocation, setSelfLocation] = React.useState<{ lat: number; lng: number } | null>(null);
  const [cancelSheetOpen, setCancelSheetOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState(DRIVER_CANCELLATION_REASONS[0].value);
  const [cancelNote, setCancelNote] = React.useState("");
  const [cancelling, setCancelling] = React.useState(false);

  const [safetyOpen, setSafetyOpen] = React.useState(false);
  const [safetyView, setSafetyView] = React.useState<SafetyView>("menu");
  const [emergencyNumber, setEmergencyNumber] = React.useState<string | null>(null);
  const [triggeringSos, setTriggeringSos] = React.useState(false);
  const [sosLocationAvailable, setSosLocationAvailable] = React.useState<boolean | null>(null);
  const [reportReason, setReportReason] = React.useState(DRIVER_REPORT_REASONS[0].value);
  const [reportDescription, setReportDescription] = React.useState("");
  const [submittingReport, setSubmittingReport] = React.useState(false);
  const [passengerContact, setPassengerContact] = React.useState<MatchedPassengerContact | null>(null);
  // Set right before this driver's own cancel RPC call resolves, so the
  // realtime subscription below (which will also receive that same write)
  // doesn't mistake the driver's own cancellation for a passenger-side one.
  const selfCancelledRef = React.useRef(false);

  React.useEffect(() => {
    if (!rideId) return;
    getMatchedPassengerContact(supabase, rideId)
      .then(setPassengerContact)
      .catch(() => setPassengerContact(null));
  }, [supabase, rideId]);

  // Realtime: the passenger can now cancel an active ride at any point up
  // to and including ride_started (see passenger_cancel_active_ride(),
  // migration 20260831150000) — this driver screen previously had no way
  // to find out except the next manual action failing with a confusing
  // error. Surfaces a clear, dedicated "Passenger cancelled the ride"
  // screen instead of silently leaving the driver mid-flow.
  React.useEffect(() => {
    if (!rideId) return;
    const unsubscribe = subscribeToRide(supabase, rideId, (updated) => {
      if (selfCancelledRef.current) return;
      setRide(updated);
      if (updated.status === "cancelled" && updated.cancelled_by === "passenger") {
        setPhase("CANCELLED_BY_PASSENGER");
      }
    });
    return unsubscribe;
  }, [supabase, rideId]);

  React.useEffect(() => {
    if (!rideId) return;
    getRide(supabase, rideId)
      .then(setRide)
      .finally(() => setLoading(false));
    getRideTracking(supabase, rideId)
      .then(setTracking)
      .catch(() => setTracking(null));
    getAppSettingValue(supabase, "emergency_contact_number")
      .then((v) => setEmergencyNumber(typeof v === "string" ? v : null))
      .catch(() => setEmergencyNumber(null));
  }, [supabase, rideId]);

  // Live location tracking for the duration of the active ride only —
  // starts here, stops explicitly the moment the ride reaches SUMMARY
  // (completed) or this screen unmounts. A driver's location is never
  // tracked more precisely than this without an active ride to justify
  // it (Phase 8's lighter online-but-idle ping continues to cover that
  // case on the Dashboard, unchanged).
  React.useEffect(() => {
    if (!user || !rideId || phase === "SUMMARY" || phase === "CANCELLED_BY_PASSENGER" || phase === "CANCELLED_BY_DRIVER") return;

    const stopWatching = watchDriverLocation({
      onUpdate: (pos) => {
        setSelfLocation(pos);
        setLocationError(null);
        updateDriverLocation(supabase, user.id, pos).catch(() => {
          // A single failed write isn't fatal — the next accepted update
          // (per the watcher's own throttling) will retry naturally.
        });
      },
      onError: setLocationError,
    });

    return stopWatching;
  }, [supabase, user, rideId, phase]);

  async function handleArrived() {
    if (!rideId) return;
    await markDriverArriving(supabase, rideId);
    setPhase("VERIFY_PIN");
  }

  function openCancelSheet() {
    setCancelReason(DRIVER_CANCELLATION_REASONS[0].value);
    setCancelNote("");
    setCancelSheetOpen(true);
  }

  async function handleCancelRide() {
    if (!rideId || !user) return;
    setCancelling(true);
    try {
      const reason = formatCancellationReason(DRIVER_CANCELLATION_REASONS, cancelReason, cancelNote);
      // Marked before the RPC resolves — cancel_ride_by_driver() updates
      // this same ride row, which the realtime subscription above would
      // otherwise also receive and misread as a passenger cancellation.
      selfCancelledRef.current = true;
      await cancelRideByDriver(supabase, rideId, user.id, reason);
      setCancelSheetOpen(false);
      // A dedicated confirmation screen, not a silent redirect — the
      // driver needs to actually see that the cancellation went through
      // and that the ride is being reassigned, not wonder whether their
      // tap registered.
      setPhase("CANCELLED_BY_DRIVER");
    } catch {
      selfCancelledRef.current = false;
      setCancelling(false);
    }
  }

  async function handlePinComplete(code: string) {
    if (!rideId) return;
    setVerifying(true);
    setPinError(false);
    try {
      // Server-authoritative: verify_ride_pin_and_start() checks the
      // entered PIN against the passenger's stored hash, confirms this
      // driver is actually assigned, and only then transitions the ride
      // — none of that is decided here in the browser. Returns null (not
      // an error) on an incorrect PIN. No attempt counter, no lockout —
      // an incorrect PIN simply doesn't start the ride; the driver can
      // immediately try again.
      const started = await verifyRidePinAndStart(supabase, rideId, code);
      if (started) {
        setRide(started);
        setPhase("TO_DROP");
      } else {
        setPinError(true);
        setPin("");
      }
    } finally {
      setVerifying(false);
    }
  }

  function handleStartNavigation() {
    // tracking.drop comes from getRideTracking(), which is
    // SECURITY DEFINER-gated to this ride's own passenger/driver/admin and
    // reads the ride's real drop_location — never a client-supplied,
    // manually-entered, hardcoded, or stale destination. Always the
    // ACCEPTED ride's actual drop coordinates, re-fetched for this ride id
    // on every mount of this screen.
    if (!tracking?.drop) return;
    const url = getExternalNavigationUrl(tracking.drop);

    // Platform-aware, and RideIT must stay open either way:
    //  - Mobile: window.location.href lets the OS intercept the Google
    //    Maps universal link and hand off to the installed app (the
    //    standard, sanctioned way a mobile web page launches a native app
    //    via a universal/App Link — there is no other browser-safe
    //    mechanism). If Google Maps isn't installed, the OS/browser falls
    //    back to the web URL in the SAME tab, matching normal mobile
    //    browser behavior for any external link.
    //  - Desktop: window.open in a new tab/window, so the RideIT tab the
    //    driver is actively using never navigates away. There is no
    //    native "Google Maps app" to hand off to on a desktop browser —
    //    this is honestly the same Google Maps web page a driver would
    //    get from clicking a maps link anywhere else on the web.
    // No popup-under/redirect tricks, no fake second tab pretending to be
    // a native app — a normal web page cannot force a native Google Maps
    // app to open on every device, and this does not claim otherwise.
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function handleCompleteRide() {
    if (!rideId) return;
    const updated = await completeRide(supabase, rideId);
    setRide(updated);
    setPhase("SUMMARY"); // stops the location watcher via the effect above
  }

  const sosPositionRef = React.useRef<{ lat: number; lng: number } | null>(null);

  function openSafety() {
    setSafetyView("menu");
    setSafetyOpen(true);
    setSosLocationAvailable(null);
    setReportReason(DRIVER_REPORT_REASONS[0].value);
    setReportDescription("");
  }

  async function openSosConfirm() {
    setSafetyView("sos_confirm");
    setSosLocationAvailable(null);
    // Resolved once here (not re-requested at confirm time) so the
    // confirmation screen can honestly show whether a location will be
    // attached before the driver commits — never fabricated if it fails.
    const pos = await getCurrentPositionOnce();
    sosPositionRef.current = pos;
    setSosLocationAvailable(pos !== null);
  }

  async function handleConfirmSos() {
    setTriggeringSos(true);
    try {
      const pos = sosPositionRef.current;
      await triggerSos(supabase, { rideId: rideId ?? undefined, lat: pos?.lat, lng: pos?.lng });
      setSafetyView("sos_done");
    } finally {
      setTriggeringSos(false);
    }
  }

  async function handleSubmitReport() {
    if (!user || !ride || !reportDescription.trim()) return;
    setSubmittingReport(true);
    try {
      const reason = DRIVER_REPORT_REASONS.find((r) => r.value === reportReason) ?? DRIVER_REPORT_REASONS[0];
      await createReport(supabase, {
        userId: user.id,
        rideId: rideId ?? undefined,
        category: reason.category,
        subject: `Passenger reported: ${reason.label}`,
        description: reportDescription.trim(),
        reportedUserId: ride.passenger_id,
      });
      setReportDescription("");
      setSafetyOpen(false);
    } finally {
      setSubmittingReport(false);
    }
  }

  const pickupLabel = ride?.pickup_address ?? "Pickup";
  const dropLabel = ride?.drop_address ?? "Drop";

  if (phase === "CANCELLED_BY_PASSENGER") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-alert-red/10 text-alert-red">
          <X size={22} aria-hidden="true" />
        </span>
        <p className="mt-4 font-display text-lg font-semibold text-ink">Passenger cancelled the ride</p>
        <p className="mt-1 max-w-xs text-sm text-ink-soft">
          {ride?.cancellation_reason ? `Reason given: ${ride.cancellation_reason}` : "The passenger cancelled this ride from their app."}
        </p>
        <Button className="mt-6 w-full max-w-xs" onClick={() => router.push("/dashboard")}>
          Back to dashboard
        </Button>
      </main>
    );
  }

  if (phase === "CANCELLED_BY_DRIVER") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-meter-green/10 text-meter-green">
          <CheckCircle2 size={22} aria-hidden="true" />
        </span>
        <p className="mt-4 font-display text-lg font-semibold text-ink">Ride cancelled</p>
        <p className="mt-1 max-w-xs text-sm text-ink-soft">
          You cancelled this ride. We&apos;ve notified the passenger and are automatically finding them another driver.
        </p>
        <Button className="mt-6 w-full max-w-xs" onClick={() => router.push("/dashboard")}>
          Back to dashboard
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="relative -mx-6 -mt-8">
        <RideMap pickup={tracking?.pickup} drop={tracking?.drop} driverLocation={selfLocation} fallbackVariant="route" className="h-56" />
        <button
          onClick={openSafety}
          className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-alert-red px-3.5 py-2 text-xs font-semibold text-white shadow-lg transition-transform active:scale-95"
        >
          <SafetyIcon size={14} aria-hidden="true" /> Safety
        </button>
      </div>
      {locationError && <p className="mt-1.5 text-xs text-alert-red">{LOCATION_ERROR_MESSAGE[locationError]}</p>}

      <Card tone="elevated" className="relative z-10 -mt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-medium text-ink">Your passenger</p>
            {loading ? (
              <Skeleton className="mt-1.5 h-3.5 w-40" />
            ) : (
              <div className="mt-1.5 flex items-start gap-1.5">
                <PinGlyph
                  tone={phase === "TO_PICKUP" || phase === "VERIFY_PIN" ? "pickup" : "drop"}
                  size={15}
                  className="mt-0.5 shrink-0"
                />
                <p className="truncate text-xs text-ink-soft">
                  {phase === "TO_PICKUP" || phase === "VERIFY_PIN" ? pickupLabel : dropLabel}
                </p>
              </div>
            )}
          </div>
          <StatusPill tone="info">
            {phase === "TO_PICKUP" && "Heading to pickup"}
            {phase === "VERIFY_PIN" && "Enter Ride PIN"}
            {phase === "TO_DROP" && "Ride in progress"}
            {phase === "SUMMARY" && "Completed"}
          </StatusPill>
        </div>
      </Card>

      {phase !== "SUMMARY" && (passengerContact?.phone || phase === "TO_PICKUP" || phase === "VERIFY_PIN" || phase === "TO_DROP") && (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <a
            href={passengerContact?.phone ? `tel:${passengerContact.phone}` : undefined}
            aria-disabled={!passengerContact?.phone}
            className={!passengerContact?.phone ? "pointer-events-none opacity-40" : undefined}
          >
            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 shadow-sm transition-all active:scale-95">
              <Phone size={16} className="text-signal-blue" />
              <span className="text-xs font-semibold text-ink">Call Passenger</span>
            </div>
          </a>
          <a
            href={passengerContact?.phone ? `sms:${passengerContact.phone}` : undefined}
            aria-disabled={!passengerContact?.phone}
            className={!passengerContact?.phone ? "pointer-events-none opacity-40" : undefined}
          >
            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 shadow-sm transition-all active:scale-95">
              <MessageCircle size={16} className="text-signal-blue" />
              <span className="text-xs font-semibold text-ink">Message</span>
            </div>
          </a>
        </div>
      )}

      {phase === "TO_PICKUP" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-auto pt-8">
          <Button className="w-full" onClick={handleArrived}>
            I&apos;ve arrived — enter Ride PIN
          </Button>
          <button
            onClick={openCancelSheet}
            disabled={cancelling}
            className="mt-3 w-full text-center text-sm font-medium text-alert-red disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel ride"}
          </button>
        </motion.div>
      )}

      {phase === "VERIFY_PIN" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
          <p className="text-sm font-medium text-ink">Enter Passenger Ride PIN</p>
          <p className="mt-0.5 text-xs text-ink-soft">Ask the passenger to tell you their permanent 4-digit Ride PIN.</p>
          <div className="mt-3">
            <OtpInput length={4} value={pin} onChange={setPin} onComplete={handlePinComplete} error={pinError} disabled={verifying} />
          </div>
          {pinError && <p className="mt-2 text-xs text-alert-red">That PIN doesn&apos;t match. Ask the passenger to confirm it and try again.</p>}
          <button
            onClick={openCancelSheet}
            disabled={cancelling}
            className="mt-6 w-full text-center text-sm font-medium text-alert-red disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel ride"}
          </button>
        </motion.div>
      )}

      {phase === "TO_DROP" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-auto flex flex-col gap-3 pt-8">
          <SlideToAction label="Slide to start navigation" onComplete={handleStartNavigation} disabled={!tracking?.drop} />
          <Button className="w-full" onClick={handleCompleteRide}>
            Complete ride
          </Button>
        </motion.div>
      )}

      {phase === "SUMMARY" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-auto pt-8 text-center">
          <MeterValue value={`₹${ride?.total_fare ?? 0}`} label="Fare collected" size="lg" className="items-center" />
          <Button className="mt-6 w-full" onClick={() => router.push(`/rate/${rideId}`)}>
            Rate your passenger
          </Button>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-3 w-full text-center text-sm text-ink-soft hover:underline"
          >
            Skip to dashboard
          </button>
        </motion.div>
      )}

      <BottomSheet open={safetyOpen} onOpenChange={setSafetyOpen}>
        <>
          <div className="flex items-center justify-between">
            <p className="font-display text-lg font-medium text-ink">
              {safetyView === "menu" && "Safety"}
              {safetyView === "sos_confirm" && "Confirm SOS"}
              {safetyView === "sos_done" && "SOS recorded"}
              {safetyView === "report" && "Report passenger"}
            </p>
            <button onClick={() => setSafetyOpen(false)} aria-label="Close" className="-m-2.5 p-2.5 text-ink-soft">
              <X size={18} />
            </button>
          </div>

            {safetyView === "menu" && (
              <div className="mt-4 flex flex-col gap-2">
                <Button variant="destructive" className="w-full justify-start" onClick={openSosConfirm}>
                  <AlertTriangle size={16} className="mr-2" /> SOS / Emergency
                </Button>
                <Link href="/emergency-contacts">
                  <Button variant="outline" className="w-full justify-start">
                    <Users size={16} className="mr-2" /> Emergency contacts
                  </Button>
                </Link>
                <Button variant="outline" className="w-full justify-start" onClick={() => setSafetyView("report")}>
                  <Flag size={16} className="mr-2" /> Report this passenger
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
                <AlertTriangle size={28} className="mx-auto text-alert-red" aria-hidden="true" />
                <p className="mt-3 text-sm text-ink">
                  This will record a safety event with our team and your approximate location. Only confirm if you need help.
                </p>
                <div
                  className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium"
                  role="status"
                  aria-live="polite"
                >
                  {sosLocationAvailable === null && <span className="text-ink-soft">Checking your location…</span>}
                  {sosLocationAvailable === true && (
                    <span className="text-meter-green-text">Your current location will be attached.</span>
                  )}
                  {sosLocationAvailable === false && (
                    <span className="flex items-center gap-1.5 text-marigold-text">
                      <MapPinOff size={14} aria-hidden="true" /> Location unavailable — the event will still be recorded.
                    </span>
                  )}
                </div>
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
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-meter-green" aria-hidden="true" />
                    A safety event was recorded with your ride and approximate location.
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-meter-green" aria-hidden="true" />
                    Ride It&apos;s safety team has been notified and will review it.
                  </li>
                </ul>
                <p className="mt-3 text-xs text-alert-red">
                  Ride It has not contacted police or emergency services on your behalf. If you are in immediate danger, call{" "}
                  {emergencyNumber ?? "your local emergency number"} directly.
                </p>
                <Button className="mt-4 w-full" onClick={() => setSafetyOpen(false)}>
                  Done
                </Button>
              </div>
            )}

            {safetyView === "report" && (
              <div className="mt-3 flex flex-col gap-3">
                <Select label="What's the issue?" size="sm" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                  {DRIVER_REPORT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="What happened?"
                  rows={3}
                  aria-label="Description"
                  className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm text-ink outline-none focus:border-signal-blue"
                />
                <Button disabled={!reportDescription.trim() || submittingReport} onClick={handleSubmitReport}>
                  {submittingReport ? "Submitting…" : "Submit report"}
                </Button>
              </div>
            )}
        </>
      </BottomSheet>

      <BottomSheet open={cancelSheetOpen} onOpenChange={setCancelSheetOpen}>
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-medium text-ink">Cancel ride</p>
          <button onClick={() => setCancelSheetOpen(false)} aria-label="Close" className="-m-2.5 p-2.5 text-ink-soft">
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <Select label="Why are you cancelling?" size="sm" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
            {DRIVER_CANCELLATION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          <textarea
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            placeholder="Add a note (optional)"
            rows={2}
            aria-label="Additional note"
            className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm text-ink outline-none focus:border-signal-blue"
          />
          <Button variant="destructive" disabled={cancelling} onClick={handleCancelRide}>
            {cancelling ? "Cancelling…" : "Confirm cancellation"}
          </Button>
        </div>
      </BottomSheet>
    </main>
  );
}

export default function NavigationPage() {
  return (
    <Suspense fallback={null}>
      <NavigationPageContent />
    </Suspense>
  );
}
