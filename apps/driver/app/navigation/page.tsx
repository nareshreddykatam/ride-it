"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Flag, Phone, X } from "lucide-react";
import { BottomSheet, Button, Card, MeterValue, OtpInput, Skeleton, StatusPill, PinGlyph, SafetyIcon } from "@ride-it/ui";
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
  type RideRow,
  type RideTrackingInfo,
} from "@ride-it/data";
import { RideMap, watchDriverLocation, getCurrentPositionOnce, type GeolocationErrorReason } from "@ride-it/maps";

type Phase = "TO_PICKUP" | "VERIFY_PIN" | "TO_DROP" | "SUMMARY";
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

  const [safetyOpen, setSafetyOpen] = React.useState(false);
  const [safetyView, setSafetyView] = React.useState<SafetyView>("menu");
  const [emergencyNumber, setEmergencyNumber] = React.useState<string | null>(null);
  const [triggeringSos, setTriggeringSos] = React.useState(false);
  const [reportDescription, setReportDescription] = React.useState("");
  const [submittingReport, setSubmittingReport] = React.useState(false);

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
    if (!user || !rideId || phase === "SUMMARY") return;

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

  async function handleCompleteRide() {
    if (!rideId) return;
    const updated = await completeRide(supabase, rideId);
    setRide(updated);
    setPhase("SUMMARY"); // stops the location watcher via the effect above
  }

  function openSafety() {
    setSafetyView("menu");
    setSafetyOpen(true);
  }

  async function handleConfirmSos() {
    setTriggeringSos(true);
    try {
      const pos = await getCurrentPositionOnce();
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
      await createReport(supabase, {
        userId: user.id,
        rideId: rideId ?? undefined,
        category: "passenger_issue",
        subject: "Passenger reported by driver",
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

      <Card tone="elevated" className="relative z-10 -mt-6 rounded-2xl">
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

      {phase === "TO_PICKUP" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-auto pt-8">
          <Button className="w-full" onClick={handleArrived}>
            I&apos;ve arrived — enter Ride PIN
          </Button>
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
        </motion.div>
      )}

      {phase === "TO_DROP" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-auto pt-8">
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
                <Button variant="destructive" className="w-full justify-start" onClick={() => setSafetyView("sos_confirm")}>
                  <AlertTriangle size={16} className="mr-2" /> SOS / Emergency
                </Button>
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
                <AlertTriangle size={28} className="mx-auto text-alert-red" />
                <p className="mt-3 text-sm text-ink">
                  This will record a safety event with our team and your approximate location. Only confirm if you need help.
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
              <div className="mt-3">
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="What happened?"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm text-ink outline-none focus:border-signal-blue"
                />
                <Button className="mt-3 w-full" disabled={!reportDescription.trim() || submittingReport} onClick={handleSubmitReport}>
                  {submittingReport ? "Submitting…" : "Submit report"}
                </Button>
              </div>
            )}
        </>
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
