"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Flag, Phone, ShieldAlert, Users } from "lucide-react";
import { BottomSheet, Button, EmptyState, Select, StatusPill, SafetyIcon } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getAppSettingValue,
  createReport,
  listOwnSafetyEvents,
  listSupportTicketsForUser,
  PASSENGER_REPORT_REASONS,
  type SafetyEventRow,
  type SupportTicketRow,
} from "@ride-it/data";

const SAFETY_EVENT_TONE: Record<string, "pending" | "info" | "online" | "alert" | "offline"> = {
  open: "alert",
  acknowledged: "pending",
  investigating: "pending",
  escalated: "alert",
  resolved: "online",
  closed: "offline",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function SafetyCenterPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [emergencyNumber, setEmergencyNumber] = React.useState<string | null>(null);
  const [events, setEvents] = React.useState<SafetyEventRow[]>([]);
  const [reports, setReports] = React.useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [reportReason, setReportReason] = React.useState(PASSENGER_REPORT_REASONS[0].value);
  const [reportDescription, setReportDescription] = React.useState("");
  const [submittingReport, setSubmittingReport] = React.useState(false);
  const [reportSubmitted, setReportSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    Promise.all([
      getAppSettingValue(supabase, "emergency_contact_number").catch(() => null),
      listOwnSafetyEvents(supabase, user.id).catch(() => []),
      listSupportTicketsForUser(supabase, user.id).catch(() => []),
    ])
      .then(([num, ev, rep]) => {
        setEmergencyNumber(typeof num === "string" ? num : null);
        setEvents(ev);
        setReports(rep);
      })
      .finally(() => setLoading(false));
  }, [supabase, user]);

  function openReport() {
    setReportReason(PASSENGER_REPORT_REASONS[0].value);
    setReportDescription("");
    setReportSubmitted(false);
    setReportOpen(true);
  }

  async function handleSubmitReport() {
    if (!user || !reportDescription.trim()) return;
    setSubmittingReport(true);
    try {
      const reason = PASSENGER_REPORT_REASONS.find((r) => r.value === reportReason) ?? PASSENGER_REPORT_REASONS[0];
      await createReport(supabase, {
        userId: user.id,
        category: reason.category,
        subject: reason.label,
        description: reportDescription.trim(),
      });
      setReportSubmitted(true);
      setReports(await listSupportTicketsForUser(supabase, user.id));
    } finally {
      setSubmittingReport(false);
    }
  }

  return (
    <main className="flex-1 px-6 py-8">
      <div className="flex items-center gap-2">
        <Link href="/profile" aria-label="Back" className="-m-2.5 p-2.5 text-ink-soft">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-alert-red/10 text-alert-red-text">
            <SafetyIcon size={20} aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl font-bold text-ink">Safety Center</h1>
        </div>
      </div>
      <p className="mt-1 pl-[52px] text-sm text-ink-soft">
        Manage emergency contacts, review past reports, and reach us if something felt wrong on a ride.
      </p>

      {/* Emergency action is the primary action on this screen — placed
          first and visually distinct (solid fill, not another list row)
          so it's never buried under secondary settings-style rows. */}
      {emergencyNumber && (
        <a href={`tel:${emergencyNumber}`} className="mt-5 block">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-alert-red p-4 text-white shadow-md transition-transform active:scale-[0.99]">
            <span className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Phone size={20} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-bold">Call emergency services</span>
                <span className="block text-xs text-white/80">{emergencyNumber} — India&apos;s national emergency number</span>
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0" aria-hidden="true" />
          </div>
        </a>
      )}

      <div className="mt-3 flex flex-col gap-3">
        <Link href="/trusted-contacts">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-md active:translate-y-0">
            <span className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tint-violet text-violet-text">
                <Users size={20} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">Trusted contacts</span>
                <span className="block text-xs text-ink-soft">People you can share a ride with, or reach in an emergency</span>
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-soft" aria-hidden="true" />
          </div>
        </Link>

        <button type="button" onClick={openReport} className="w-full text-left">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-md active:translate-y-0">
            <span className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tint-marigold text-marigold-text">
                <Flag size={20} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">Report an issue</span>
                <span className="block text-xs text-ink-soft">Unsafe driving, harassment, or anything else from a past ride</span>
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-soft" aria-hidden="true" />
          </div>
        </button>
      </div>

      {events.length > 0 && (
        <>
          <p className="mb-2 mt-6 px-1 text-xs font-bold uppercase tracking-wider text-ink-soft">Your SOS history</p>
          <div className="flex flex-col gap-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
                <span className="flex items-center gap-2.5">
                  <ShieldAlert size={16} className="shrink-0 text-alert-red" aria-hidden="true" />
                  <span className="text-xs text-ink-soft">{formatDateTime(e.created_at)}</span>
                </span>
                <StatusPill tone={SAFETY_EVENT_TONE[e.status] ?? "info"}>{e.status}</StatusPill>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && reports.length > 0 && (
        <>
          <p className="mb-2 mt-6 px-1 text-xs font-bold uppercase tracking-wider text-ink-soft">Your reports</p>
          <div className="flex flex-col gap-2">
            {reports.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{r.subject}</p>
                  <StatusPill tone={r.status === "resolved" || r.status === "closed" ? "online" : "pending"}>{r.status}</StatusPill>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">{formatDateTime(r.created_at)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && events.length === 0 && reports.length === 0 && (
        <div className="mt-6">
          <EmptyState icon={<SafetyIcon size={20} />} title="Nothing to show" description="Your safety reports and SOS history will appear here." />
        </div>
      )}

      <BottomSheet open={reportOpen} onOpenChange={setReportOpen}>
        {reportSubmitted ? (
          <div className="text-center">
            <p className="text-sm font-medium text-ink">Report submitted</p>
            <p className="mt-1 text-xs text-ink-soft">Our team will review it. Thank you for letting us know.</p>
            <Button className="mt-4 w-full" onClick={() => setReportOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-ink">Report an issue</p>
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
                rows={4}
                aria-label="Description"
                className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm text-ink outline-none focus:border-signal-blue"
              />
              <Button disabled={!reportDescription.trim() || submittingReport} onClick={handleSubmitReport}>
                {submittingReport ? "Submitting…" : "Submit report"}
              </Button>
            </div>
          </>
        )}
      </BottomSheet>
    </main>
  );
}
