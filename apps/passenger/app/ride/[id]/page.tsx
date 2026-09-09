"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  MapPinOff,
  Phone,
  MessageCircle,
  MessageSquare,
  Share2,
  ShieldAlert,
  Users,
  Flag,
  X,
} from "lucide-react";
import { BottomSheet, Button, Card, DriverCard, MeterValue, Select, Skeleton, StatusPill, VEHICLE_VISUALS, SafetyIcon, SpeedChip, RideChatPanel } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getRide,
  cancelActiveRide,
  subscribeToRide,
  getMyRidePin,
  getMatchedDriverContact,
  PASSENGER_CANCELLATION_REASONS,
  formatCancellationReason,
  getRideMessages,
  sendRideMessage,
  markRideMessagesRead,
  getUnreadRideMessageCount,
  subscribeToRideMessages,
  isRideChatAvailable,
  canSendRideMessage,
  type RideRow,
  type MatchedDriverContact,
  type RideMessageRow,
} from "@ride-it/data";
import { getDriverProfile, type DriverProfileRow } from "@ride-it/data";
import { getRideTracking, subscribeToDriverLocationChanges, type RideTrackingInfo } from "@ride-it/data";
import { triggerSos, getAppSettingValue, createReport, PASSENGER_REPORT_REASONS } from "@ride-it/data";
import { createRideShare, listTrustedContacts, type TrustedContactRow } from "@ride-it/data";
import { useAuth } from "@ride-it/auth";
import { RideMap, LOCATION_CONFIG, SPEED_CONFIG, getCurrentPositionOnce } from "@ride-it/maps";

const STEPS: { status: RideRow["status"]; label: string }[] = [
  { status: "accepted", label: "Driver assigned" },
  { status: "driver_arriving", label: "Arriving" },
  { status: "ride_started", label: "On the way" },
];

function stepIndexForStatus(status: RideRow["status"]): number {
  const i = STEPS.findIndex((s) => s.status === status);
  if (i >= 0) return i;
  if (["destination_reached", "payment_collected", "ride_completed", "payment", "rated"].includes(status)) return STEPS.length - 1;
  return 0;
}

const END_OF_RIDE_LABEL: Partial<Record<RideRow["status"], string>> = {
  destination_reached: "Driver has reached your destination",
  payment_collected: "Payment collected",
};

function isStale(updatedAt: string | null, thresholdSeconds: number): boolean {
  if (!updatedAt) return true;
  const ageSeconds = (Date.now() - new Date(updatedAt).getTime()) / 1000;
  return ageSeconds > thresholdSeconds;
}

const ACTIVE_RIDE_STATUSES: RideRow["status"][] = ["ride_started", "destination_reached", "payment_collected"];

type SafetyView = "menu" | "sos_confirm" | "sos_done" | "share" | "report";

export default function RideStatusPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [ride, setRide] = React.useState<RideRow | null>(null);
  const [driver, setDriver] = React.useState<DriverProfileRow | null>(null);
  const [matchedContact, setMatchedContact] = React.useState<MatchedDriverContact | null>(null);
  const [selfieUrl, setSelfieUrl] = React.useState<string | null>(null);
  const [tracking, setTracking] = React.useState<RideTrackingInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelSheetOpen, setCancelSheetOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState(PASSENGER_CANCELLATION_REASONS[0].value);
  const [cancelNote, setCancelNote] = React.useState("");
  const [ridePin, setRidePin] = React.useState<string | null>(null);
  const [ridePinChecked, setRidePinChecked] = React.useState(false);
  const navigatedRef = React.useRef(false);
  // Tracks which driver_id loadDriver() has already been called for.
  // Reading `driver` state here would work in principle, but the realtime
  // subscription's callback below is deliberately created once (deps
  // [supabase, params.id]) so it doesn't tear down/resubscribe on every
  // status change -- that means it closes over `driver` at mount time
  // (always null) forever. Checking a ref instead of the stale state is
  // what actually makes "only load driver info once" true: previously
  // `!driver` was always true, so loadDriver() (3 network calls) re-ran on
  // every single realtime ride update for the rest of the ride.
  const loadedDriverIdRef = React.useRef<string | null>(null);

  // Safety sheet state
  const [safetyOpen, setSafetyOpen] = React.useState(false);
  const [safetyView, setSafetyView] = React.useState<SafetyView>("menu");
  const [emergencyNumber, setEmergencyNumber] = React.useState<string | null>(null);
  const [triggeringSos, setTriggeringSos] = React.useState(false);
  const [contacts, setContacts] = React.useState<TrustedContactRow[]>([]);
  const [sharingWith, setSharingWith] = React.useState<string | null>(null);
  const [shareLink, setShareLink] = React.useState<string | null>(null);
  const [sharing, setSharing] = React.useState(false);
  const [sosLocationAvailable, setSosLocationAvailable] = React.useState<boolean | null>(null);
  const [reportReason, setReportReason] = React.useState(PASSENGER_REPORT_REASONS[0].value);
  const [reportDescription, setReportDescription] = React.useState("");
  const [submittingReport, setSubmittingReport] = React.useState(false);
  const sosPositionRef = React.useRef<{ lat: number; lng: number } | null>(null);

  // Chat state
  const [chatOpen, setChatOpen] = React.useState(false);
  const [chatMessages, setChatMessages] = React.useState<RideMessageRow[]>([]);
  const [chatLoaded, setChatLoaded] = React.useState(false);
  const [chatLoading, setChatLoading] = React.useState(false);
  const [chatLoadingMore, setChatLoadingMore] = React.useState(false);
  const [chatHasMore, setChatHasMore] = React.useState(false);
  const [chatSending, setChatSending] = React.useState(false);
  const [chatSendError, setChatSendError] = React.useState<string | null>(null);
  const [unreadCount, setUnreadCount] = React.useState(0);
  // Read inside the realtime subscription's stable closure (deps
  // intentionally exclude chatOpen — see subscribeToRide's own identical
  // ref pattern above for why re-subscribing on every state change would
  // be wrong here) to decide "badge the unread count" vs "mark read
  // immediately" without resubscribing the channel every time the sheet
  // opens/closes.
  const chatOpenRef = React.useRef(false);
  chatOpenRef.current = chatOpen;
  // Next.js reuses this SAME component instance across a navigation that
  // only changes the [id] dynamic segment (e.g. browser back/forward
  // between two already-visited /ride/[id] pages) -- it does not remount
  // by default. Without this ref, an in-flight fetch/send started for the
  // PREVIOUS ride could resolve after the switch and incorrectly apply
  // its result (someone else's messages) to the now-current ride's chat
  // state. Updated on every render, so by the time any async callback
  // resolves it reflects whichever ride is ACTUALLY showing right now.
  const chatRideKeyRef = React.useRef(params.id);
  chatRideKeyRef.current = params.id;

  const loadDriver = React.useCallback(
    async (driverId: string) => {
      try {
        setDriver(await getDriverProfile(supabase, driverId));
      } catch {
        setDriver(null);
      }
      // Name/phone/plate: getDriverProfile's users/vehicles embeds come
      // back null for a passenger caller (no general passenger-readable
      // RLS policy on those tables) — get_matched_driver_contact() is the
      // one narrow, audited path that actually returns them, scoped to
      // this passenger's own active ride. See packages/data/src/rides.ts.
      try {
        setMatchedContact(await getMatchedDriverContact(supabase, params.id));
      } catch {
        setMatchedContact(null);
      }
      // Selfie: same reasoning, but minting a signed URL for a private
      // Storage object requires the Storage API (not SQL), so this goes
      // through a Route Handler that re-derives the path server-side
      // rather than trusting anything from the client.
      try {
        const res = await fetch(`/api/rides/${params.id}/driver-selfie`);
        const body = (await res.json()) as { signedUrl: string | null };
        setSelfieUrl(body.signedUrl);
      } catch {
        setSelfieUrl(null);
      }
    },
    [supabase, params.id]
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
        if (r?.driver_id) {
          loadedDriverIdRef.current = r.driver_id;
          await loadDriver(r.driver_id);
        }
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
      if (updated.driver_id && loadedDriverIdRef.current !== updated.driver_id) {
        loadedDriverIdRef.current = updated.driver_id;
        await loadDriver(updated.driver_id);
      }
      if (!navigatedRef.current && (updated.status === "ride_completed" || updated.status === "payment")) {
        navigatedRef.current = true;
        router.push(`/ride/${params.id}/complete`);
      }
      // The assigned driver cancelled — cancel_ride_by_driver() (migration
      // 20260831150000) reset this SAME ride back to "requested" rather
      // than creating a new one, so the existing Matching screen (which
      // re-fetches requested_at fresh and subscribes to this same ride's
      // status) is fully reusable for showing the passenger realtime
      // reassignment progress, with zero duplicated matching UI.
      if (!navigatedRef.current && updated.status === "requested") {
        navigatedRef.current = true;
        router.push(`/booking/matching?rideId=${params.id}&vehicleType=${updated.vehicle_type}&reason=driver_cancelled`);
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

  // Fetches the passenger's own permanent Ride PIN once the ride reaches
  // "accepted" — never before (the passenger has no driver to share it
  // with yet), and only once (the PIN doesn't change per ride, so no need
  // to refetch on every status change while it's already known).
  React.useEffect(() => {
    const rideStatus = ride?.status;
    if (rideStatus !== "accepted" && rideStatus !== "driver_arriving") return;
    if (ridePinChecked) return;
    let active = true;
    getMyRidePin(supabase)
      .then((pin) => {
        if (!active) return;
        setRidePin(pin);
        setRidePinChecked(true);
      })
      .catch(() => {
        // Leave ridePin null but still mark "checked" — the fallback
        // recovery message renders instead of silently showing nothing
        // forever, per the safe-error-state requirement.
        if (active) setRidePinChecked(true);
      });
    return () => {
      active = false;
    };
  }, [supabase, ride?.status, ridePinChecked]);

  const chatAvailable = isRideChatAvailable(ride?.driver_id ?? null);

  // Resets all chat state when this component starts showing a DIFFERENT
  // ride (see chatRideKeyRef's comment above) — otherwise chatLoaded
  // staying true would skip re-fetching, and the previous ride's messages/
  // unread count would briefly (or indefinitely) show for the new ride.
  React.useEffect(() => {
    setChatOpen(false);
    setChatMessages([]);
    setChatLoaded(false);
    setChatLoading(false);
    setChatHasMore(false);
    setChatSendError(null);
    setUnreadCount(0);
  }, [params.id]);

  // Unread badge — fetched once chat becomes available (driver assigned),
  // independent of ever opening the chat sheet, so the badge is accurate
  // from the first render after assignment.
  React.useEffect(() => {
    if (!chatAvailable || !user) return;
    getUnreadRideMessageCount(supabase, params.id, user.id)
      .then(setUnreadCount)
      .catch(() => {});
  }, [supabase, params.id, chatAvailable, user]);

  // Realtime: new chat messages. Subscribes once chat becomes available
  // and stays subscribed for the rest of this screen's lifetime (not
  // torn down/recreated every time the sheet opens/closes) — freshChannel()
  // guarantees a unique topic per call, so this can never collide with
  // another subscription on this same ride_id, including a stale one from
  // a prior mount during a page transition (see packages/data/src/
  // realtime.ts's own documented reasoning).
  React.useEffect(() => {
    if (!chatAvailable) return;
    const unsubscribe = subscribeToRideMessages(supabase, params.id, (message) => {
      setChatMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      if (message.sender_id === user?.id) return;
      if (chatOpenRef.current) {
        // Chat is actively open — reflect as read immediately instead of
        // badging an unread count the passenger is already looking at.
        markRideMessagesRead(supabase, params.id).catch(() => {});
      } else {
        setUnreadCount((c) => c + 1);
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, params.id, chatAvailable]);

  function openChat() {
    const forRideId = params.id;
    setChatOpen(true);
    if (!chatLoaded && !chatLoading) {
      setChatLoading(true);
      getRideMessages(supabase, forRideId)
        .then((page) => {
          if (chatRideKeyRef.current !== forRideId) return; // stale response for a since-switched-away ride
          setChatMessages(page.messages);
          setChatHasMore(page.hasMore);
          setChatLoaded(true);
        })
        .catch(() => {})
        .finally(() => {
          if (chatRideKeyRef.current === forRideId) setChatLoading(false);
        });
    }
    markRideMessagesRead(supabase, forRideId)
      .then(() => {
        if (chatRideKeyRef.current === forRideId) setUnreadCount(0);
      })
      .catch(() => {});
  }

  async function handleLoadMoreChatMessages() {
    const forRideId = params.id;
    const oldest = chatMessages[0];
    if (!oldest || chatLoadingMore) return;
    setChatLoadingMore(true);
    try {
      const page = await getRideMessages(supabase, forRideId, {
        before: { createdAt: oldest.created_at, id: oldest.id },
      });
      if (chatRideKeyRef.current !== forRideId) return; // switched rides while this was in flight
      setChatMessages((prev) => [...page.messages, ...prev]);
      setChatHasMore(page.hasMore);
    } catch {
      // Best-effort — the "Load earlier messages" button simply remains, retryable.
    } finally {
      if (chatRideKeyRef.current === forRideId) setChatLoadingMore(false);
    }
  }

  async function handleSendChatMessage(text: string) {
    const forRideId = params.id;
    setChatSending(true);
    setChatSendError(null);
    try {
      const sent = await sendRideMessage(supabase, forRideId, text);
      if (chatRideKeyRef.current !== forRideId) return; // switched rides while this was in flight
      setChatMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (e) {
      // The message bubble is only ever added to chatMessages after this
      // RPC actually succeeds (above) — never optimistically beforehand —
      // so a rejected send simply never appears as sent; sendError below
      // surfaces why.
      if (chatRideKeyRef.current === forRideId) {
        setChatSendError(e instanceof Error ? e.message : "Couldn't send message. Try again.");
      }
    } finally {
      if (chatRideKeyRef.current === forRideId) setChatSending(false);
    }
  }

  function openCancelSheet() {
    setCancelReason(PASSENGER_CANCELLATION_REASONS[0].value);
    setCancelNote("");
    setCancelSheetOpen(true);
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const reason = formatCancellationReason(PASSENGER_CANCELLATION_REASONS, cancelReason, cancelNote);
      await cancelActiveRide(supabase, params.id, reason);
      router.push("/home");
    } catch {
      setCancelling(false);
    }
  }

  function openSafety() {
    setSafetyView("menu");
    setSafetyOpen(true);
    setSosLocationAvailable(null);
    setReportReason(PASSENGER_REPORT_REASONS[0].value);
    setReportDescription("");
  }

  async function openSosConfirm() {
    setSafetyView("sos_confirm");
    setSosLocationAvailable(null);
    // Resolved once here (not re-requested at confirm time) so the
    // confirmation screen can honestly show whether a location will be
    // attached before the passenger commits — never fabricated if it fails.
    const pos = await getCurrentPositionOnce();
    sosPositionRef.current = pos;
    setSosLocationAvailable(pos !== null);
  }

  async function handleConfirmSos() {
    setTriggeringSos(true);
    try {
      const pos = sosPositionRef.current;
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
      const reason = PASSENGER_REPORT_REASONS.find((r) => r.value === reportReason) ?? PASSENGER_REPORT_REASONS[0];
      await createReport(supabase, {
        userId: user.id,
        rideId: params.id,
        category: reason.category,
        subject: `Driver reported: ${reason.label}`,
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
  const canCancel = status === "accepted" || status === "driver_arriving" || status === "ride_started";
  const driverStale = tracking?.driverLocationUpdatedAt
    ? isStale(tracking.driverLocationUpdatedAt, LOCATION_CONFIG.STALE_LOCATION_THRESHOLD_SECONDS)
    : false;
  const speedStale = tracking?.driverSpeedUpdatedAt
    ? isStale(tracking.driverSpeedUpdatedAt, SPEED_CONFIG.STALE_THRESHOLD_SECONDS)
    : true;
  const showSpeed = ACTIVE_RIDE_STATUSES.includes(status);
  const chatSendable = canSendRideMessage(status, ride?.driver_id ?? null);

  const driverEtaLabel =
    tracking?.distanceToPickupMeters != null && status === "accepted"
      ? `${(tracking.distanceToPickupMeters / 1000).toFixed(1)} km`
      : undefined;

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      {/* Map fills the entire screen — the environment, not a strip. */}
      <div className="absolute inset-0">
        <RideMap
          pickup={tracking?.pickup}
          drop={tracking?.drop}
          driverLocation={tracking?.driverLocation}
          driverLocationStale={driverStale}
          vehicleType={ride?.vehicle_type}
          fallbackVariant="live"
          fallbackProgress={0.15 + stepIndex * 0.28}
          className="h-full w-full rounded-none border-0"
        />
      </div>

      <div className="relative z-10 flex items-center justify-between p-4">
        <button
          onClick={openSafety}
          className="flex items-center gap-1.5 rounded-full bg-alert-red px-3 py-1.5 text-xs font-medium text-white shadow-md"
        >
          <ShieldAlert size={13} /> Safety
        </button>
        <StatusPill tone="online" className="shadow-md">
          {END_OF_RIDE_LABEL[status] ?? STEPS[stepIndex]?.label ?? "In progress"}
        </StatusPill>
      </div>

      {showSpeed && (
        <div className="relative z-10 -mt-1 flex justify-center">
          <SpeedChip speedKmh={tracking?.driverSpeedKmh ?? null} stale={speedStale} className="shadow-md" />
        </div>
      )}

      {tracking?.driverLocation && driverStale && (
        <p className="relative z-10 mx-4 rounded-lg bg-surface/95 px-3 py-2 text-xs text-marigold-text shadow-md backdrop-blur-sm">
          Your driver&apos;s location hasn&apos;t updated recently — position shown may be outdated.
        </p>
      )}

      {/* Bottom-sheet-style overlay — driver identity + actions read as
          floating on top of the map environment, not stacked below it in
          normal document flow. */}
      <div className="relative z-10 mt-auto max-h-[70vh] overflow-y-auto rounded-sheet bg-surface shadow-lg">
        <span className="sticky top-0 mx-auto mt-2.5 block h-1 w-10 rounded-full bg-ink/15" aria-hidden="true" />
        <div className="px-6 pb-8 pt-3">
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

          {loading ? (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          ) : (
            driver && (
              <DriverCard
                className="mt-4"
                name={matchedContact?.fullName ?? "Your driver"}
                rating={driver.rating}
                vehicleLabel={VEHICLE_VISUALS[driver.vehicle_type].label}
                plateNumber={matchedContact?.plateNumber ?? "—"}
                verified={driver.verification_status === "approved"}
                etaLabel={driverEtaLabel}
                photoUrl={selfieUrl}
              />
            )
          )}

          {chatAvailable && (
            <Button variant="outline" className="relative mt-4 w-full" onClick={openChat}>
              <MessageSquare size={16} className="mr-2" />
              {chatSendable ? "Chat with your driver" : "View chat"}
              {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-alert-red px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          )}

          {driver && (status === "accepted" || status === "driver_arriving" || status === "ride_started") && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              <a
                href={matchedContact?.phone ? `tel:${matchedContact.phone}` : undefined}
                aria-disabled={!matchedContact?.phone}
                className={!matchedContact?.phone ? "pointer-events-none opacity-40" : undefined}
              >
                <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface py-3">
                  <Phone size={18} className="text-signal-blue" />
                  <span className="text-[11px] text-ink-soft">Call</span>
                </div>
              </a>
              <a
                href={matchedContact?.phone ? `sms:${matchedContact.phone}` : undefined}
                aria-disabled={!matchedContact?.phone}
                className={!matchedContact?.phone ? "pointer-events-none opacity-40" : undefined}
              >
                <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface py-3">
                  <MessageCircle size={18} className="text-signal-blue" />
                  <span className="text-[11px] text-ink-soft">Message</span>
                </div>
              </a>
              <button type="button" onClick={openSafety} className="w-full">
                <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface py-3">
                  <SafetyIcon size={18} className="text-alert-red" />
                  <span className="text-[11px] text-ink-soft">Safety</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSafetyOpen(true);
                  openShare();
                }}
                className="w-full"
              >
                <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface py-3">
                  <Share2 size={18} className="text-signal-blue" />
                  <span className="text-[11px] text-ink-soft">Share</span>
                </div>
              </button>
            </div>
          )}

          {(status === "accepted" || status === "driver_arriving") && ridePin && (
            <Card tone="tinted" className="mt-4 text-center">
              <p className="text-sm font-medium text-ink">Your Ride PIN</p>
              <div className="mt-2 flex justify-center">
                <MeterValue value={ridePin} size="lg" />
              </div>
              <p className="mt-2 text-xs text-ink-soft">Share this PIN with your driver when they arrive.</p>
            </Card>
          )}

          {(status === "accepted" || status === "driver_arriving") && ridePinChecked && !ridePin && (
            <Card className="mt-4">
              <p className="text-sm text-ink">Your Ride PIN isn&apos;t available to display yet.</p>
              <p className="mt-1 text-xs text-ink-soft">
                Set your Ride PIN again from Profile to enable this — you&apos;ll still tell your driver the same way once it&apos;s set.
              </p>
            </Card>
          )}

          {status === "ride_started" && (
            <Card className="mt-4">
              <p className="text-sm text-ink">Ride PIN verified — enjoy your ride.</p>
            </Card>
          )}

          {/* Destination reached / payment collection — purely informational.
              The passenger never chooses or confirms a payment method or
              amount here; the driver does, server-side (see
              driver_select_payment_method / driver_confirm_payment_received). */}
          {(status === "destination_reached" || status === "payment_collected") && (
            <Card className="mt-4">
              <p className="text-sm font-medium text-ink">
                {status === "payment_collected" ? "Payment collected" : "Final fare"}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-ink-soft">Total</span>
                <MeterValue value={`₹${ride?.total_fare ?? 0}`} size="md" />
              </div>
              {ride?.payment_method && (
                <p className="mt-2 text-xs text-ink-soft">
                  {status === "payment_collected" ? "Paid via" : "Your driver selected"}{" "}
                  {ride.payment_method === "driver_upi" ? "Driver UPI" : "Cash"}.
                </p>
              )}
            </Card>
          )}

          <div className="mt-5 flex flex-col gap-2">
            {canCancel && (
              <button
                onClick={openCancelSheet}
                disabled={cancelling}
                className="text-center text-sm font-medium text-alert-red disabled:opacity-50"
              >
                {cancelling ? "Cancelling…" : "Cancel ride"}
              </button>
            )}
            <p className="text-center text-xs text-ink-soft">This screen updates automatically as your ride progresses.</p>
          </div>
        </div>
      </div>

      <BottomSheet open={safetyOpen} onOpenChange={setSafetyOpen}>
        <>
          <div className="flex items-center justify-between">
            <p className="font-display text-lg font-medium text-ink">
              {safetyView === "menu" && "Safety"}
              {safetyView === "sos_confirm" && "Confirm SOS"}
              {safetyView === "sos_done" && "SOS recorded"}
              {safetyView === "share" && "Share this ride"}
              {safetyView === "report" && "Report an issue"}
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
                <AlertTriangle size={28} className="mx-auto text-alert-red" aria-hidden="true" />
                <p className="mt-3 text-sm text-ink">
                  This will record a safety event with our team and your approximate location. Only confirm if you
                  need help.
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
                    Ridora&apos;s safety team has been notified and will review it.
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-meter-green" aria-hidden="true" />
                    You can still share this ride or call emergency services directly.
                  </li>
                </ul>
                <p className="mt-3 text-xs text-alert-red">
                  Ridora has not contacted police or emergency services on your behalf. If you are in immediate
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
              <div className="mt-3 flex flex-col gap-3">
                <Select label="What's the issue?" size="sm" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                  {PASSENGER_REPORT_REASONS.map((r) => (
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
            {PASSENGER_CANCELLATION_REASONS.map((r) => (
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
          <Button variant="destructive" disabled={cancelling} onClick={handleCancel}>
            {cancelling ? "Cancelling…" : "Confirm cancellation"}
          </Button>
        </div>
      </BottomSheet>

      {chatAvailable && (
        <RideChatPanel
          open={chatOpen}
          onOpenChange={setChatOpen}
          otherPartyName={matchedContact?.fullName ?? driver?.full_name ?? "your driver"}
          messages={chatMessages.map((m) => ({
            id: m.id,
            message: m.message,
            createdAt: m.created_at,
            fromMe: m.sender_id === user?.id,
          }))}
          loading={chatLoading}
          hasMore={chatHasMore}
          loadingMore={chatLoadingMore}
          onLoadMore={handleLoadMoreChatMessages}
          sending={chatSending}
          sendError={chatSendError}
          onSend={handleSendChatMessage}
          canSend={chatSendable}
          disabledReason={
            status === "ride_completed" || status === "payment" || status === "rated"
              ? "This ride has ended — chat is read-only."
              : status === "cancelled"
                ? "This ride was cancelled — chat is read-only."
                : "This chat is no longer active."
          }
        />
      )}
    </main>
  );
}
