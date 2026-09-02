"use client";

import * as React from "react";
import Link from "next/link";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  SafetyIcon,
  Skeleton,
  StatusPill,
} from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  listSafetyEventsAdmin,
  setSafetyEventStatusAdmin,
  listSafetyEventNotes,
  addSafetyEventNote,
  listSupportTicketsAdmin,
  updateSupportTicketStatus,
  getSafetyAnalytics,
  type AdminSafetyEventRow,
  type AdminSafetyEventStatus,
  type AdminSafetyEventSeverity,
  type SafetyEventNoteRow,
  type SupportTicketRow,
  type SafetyAnalytics,
} from "@ride-it/data";
import { LifeBuoy, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { AdminDateRangeFilter, rangeForPreset, type DateRangeValue } from "../../../components/admin-date-range";

const SAFETY_EVENT_TONE: Record<AdminSafetyEventStatus, "pending" | "info" | "online" | "alert" | "offline"> = {
  open: "alert",
  acknowledged: "pending",
  investigating: "pending",
  escalated: "alert",
  resolved: "online",
  closed: "offline",
};

const SEVERITY_TONE: Record<AdminSafetyEventSeverity, "offline" | "info" | "pending" | "alert"> = {
  low: "offline",
  medium: "info",
  high: "pending",
  critical: "alert",
};

const SAFETY_CATEGORIES = ["safety", "driver_issue", "passenger_issue", "inappropriate_review"];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

interface SafetyEventCardProps {
  event: AdminSafetyEventRow;
  onChanged: () => void;
}

function SafetyEventCard({ event, onChanged }: SafetyEventCardProps) {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [busy, setBusy] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [notes, setNotes] = React.useState<SafetyEventNoteRow[] | null>(null);
  const [noteText, setNoteText] = React.useState("");
  const [confirmAction, setConfirmAction] = React.useState<"resolved" | "closed" | null>(null);

  async function loadHistory() {
    setNotes(await listSafetyEventNotes(supabase, event.id));
  }

  async function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && notes === null) await loadHistory();
  }

  async function transition(status: AdminSafetyEventStatus) {
    setBusy(true);
    try {
      await setSafetyEventStatusAdmin(supabase, event.id, status);
      if (historyOpen) await loadHistory();
      onChanged();
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function submitNote() {
    if (!noteText.trim()) return;
    setBusy(true);
    try {
      await addSafetyEventNote(supabase, event.id, noteText.trim());
      setNoteText("");
      await loadHistory();
    } finally {
      setBusy(false);
    }
  }

  const isTerminal = event.status === "closed";

  return (
    <div className="py-3">
      <div className="flex gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            event.status === "open" || event.status === "escalated" ? "bg-alert-red/10 text-alert-red-text" : "bg-tint-blue text-signal-blue"
          }`}
          aria-hidden="true"
        >
          <ShieldAlert size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-ink">
                {event.user_name ?? "Unknown user"} <span className="text-ink-soft">({event.triggered_by_role})</span>
              </p>
              <p className="text-xs text-ink-soft">
                #{shortId(event.id)} · {formatDateTime(event.created_at)} · {event.event_type}
                {event.ride_id && (
                  <>
                    {" · "}
                    <Link href={`/rides/${event.ride_id}`} className="text-signal-blue">
                      View ride
                    </Link>
                    {event.ride_status && ` (${event.ride_status})`}
                  </>
                )}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {event.latitude != null && event.longitude != null
                  ? `${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`
                  : "Location unavailable"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <StatusPill tone={SEVERITY_TONE[event.severity]}>{event.severity}</StatusPill>
              <StatusPill tone={SAFETY_EVENT_TONE[event.status]}>{event.status}</StatusPill>
            </div>
          </div>

          {!isTerminal && (
            <div className="mt-2 flex flex-wrap gap-2">
              {event.status === "open" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => transition("acknowledged")}>
                  Acknowledge
                </Button>
              )}
              {(event.status === "open" || event.status === "acknowledged") && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => transition("investigating")}>
                  Investigating
                </Button>
              )}
              {event.status !== "escalated" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => transition("escalated")}>
                  Escalate
                </Button>
              )}
              {event.status !== "resolved" && (
                <Button size="sm" disabled={busy} onClick={() => setConfirmAction("resolved")}>
                  Resolve
                </Button>
              )}
            </div>
          )}
          {event.status === "resolved" && (
            <div className="mt-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmAction("closed")}>
                Close
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={toggleHistory}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-signal-blue"
          >
            {historyOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Notes &amp; history
          </button>

          {historyOpen && (
            <div className="mt-2 rounded-lg border border-border bg-paper p-3">
              {notes === null ? (
                <Skeleton className="h-10 w-full" />
              ) : notes.length === 0 ? (
                <p className="text-xs text-ink-soft">No admin activity yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {notes.map((n) => (
                    <li key={n.id} className="text-xs">
                      <span className="font-medium text-ink">{n.admin_name ?? (n.admin_id ? "Admin" : "System")}</span>{" "}
                      <span className="text-ink-soft">{formatDateTime(n.created_at)}</span>
                      {n.status_transition_to && (
                        <span className="ml-1.5 text-ink-soft">→ {n.status_transition_to}</span>
                      )}
                      {n.note && <p className="mt-0.5 text-ink">{n.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {!isTerminal && (
                <div className="mt-2 flex gap-2">
                  <input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note…"
                    aria-label="Add a note"
                    className="h-8 flex-1 rounded-lg border border-border bg-surface px-2.5 text-xs text-ink outline-none focus:border-signal-blue"
                  />
                  <Button size="sm" variant="outline" disabled={busy || !noteText.trim()} onClick={submitNote}>
                    Add
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction === "closed" ? "Close this safety event?" : "Resolve this safety event?"}
        description={
          confirmAction === "closed"
            ? "Closing is final — a closed event can no longer be modified."
            : "This marks the event handled. You can still close it out afterward."
        }
        confirmLabel={confirmAction === "closed" ? "Close event" : "Resolve"}
        tone={confirmAction === "closed" ? "destructive" : "default"}
        loading={busy}
        onConfirm={async () => {
          if (confirmAction) await transition(confirmAction);
        }}
      />
    </div>
  );
}

export default function SafetyDashboardPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [events, setEvents] = React.useState<AdminSafetyEventRow[]>([]);
  const [tickets, setTickets] = React.useState<SupportTicketRow[]>([]);
  const [analytics, setAnalytics] = React.useState<SafetyAnalytics | null>(null);
  const [analyticsRange, setAnalyticsRange] = React.useState<DateRangeValue>(() => {
    const { start, end } = rangeForPreset("30d");
    return { preset: "30d", start, end };
  });
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>("open");

  const refresh = React.useCallback(async () => {
    const [ev, allTickets] = await Promise.all([
      listSafetyEventsAdmin(supabase, statusFilter === "all" ? {} : { status: statusFilter }),
      listSupportTicketsAdmin(supabase, { status: "open" }),
    ]);
    setEvents(ev);
    setTickets(allTickets.filter((t) => SAFETY_CATEGORIES.includes(t.category)));
  }, [supabase, statusFilter]);

  React.useEffect(() => {
    if (!user) return;
    refresh().finally(() => setLoading(false));
  }, [user, refresh]);

  React.useEffect(() => {
    if (!user) return;
    getSafetyAnalytics(supabase, analyticsRange.start, analyticsRange.end)
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [supabase, user, analyticsRange]);

  async function handleTicketResolve(ticketId: string) {
    setBusy(ticketId);
    try {
      await updateSupportTicketStatus(supabase, ticketId, "resolved");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-alert-red/10 text-alert-red-text">
          <SafetyIcon size={20} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Safety</h1>
          <p className="text-sm text-ink-soft">
            SOS events and safety-related reports. Ridora has no automated emergency-service integration — every
            event here requires human review.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by event status">
        {["open", "acknowledged", "investigating", "escalated", "resolved", "all"].map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              statusFilter === s ? "bg-signal-blue text-white" : "bg-ink/5 text-ink-soft"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base font-medium text-ink">Analytics</h2>
        <AdminDateRangeFilter value={analyticsRange} onChange={setAnalyticsRange} />
      </div>
      <Card className="mt-2">
        {analytics === null ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">By status</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(analytics.by_status).length === 0 ? (
                  <span className="text-xs text-ink-soft">No events in range.</span>
                ) : (
                  Object.entries(analytics.by_status).map(([status, count]) => (
                    <StatusPill key={status} tone={SAFETY_EVENT_TONE[status as AdminSafetyEventStatus] ?? "info"}>
                      {status} · {count}
                    </StatusPill>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">By severity</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(analytics.by_severity).length === 0 ? (
                  <span className="text-xs text-ink-soft">No events in range.</span>
                ) : (
                  Object.entries(analytics.by_severity).map(([severity, count]) => (
                    <StatusPill key={severity} tone={SEVERITY_TONE[severity as AdminSafetyEventSeverity] ?? "info"}>
                      {severity} · {count}
                    </StatusPill>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">By vehicle</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(analytics.by_vehicle_type).length === 0 ? (
                  <span className="text-xs text-ink-soft">No events in range.</span>
                ) : (
                  Object.entries(analytics.by_vehicle_type).map(([vehicle, count]) => (
                    <StatusPill key={vehicle} tone="info">
                      {vehicle} · {count}
                    </StatusPill>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-4" accent="red">
        <CardHeader>
          <CardTitle>SOS events</CardTitle>
        </CardHeader>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : events.length === 0 ? (
          <EmptyState icon={<LifeBuoy size={20} />} title="No safety events" description="Nothing matches this filter right now." />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {events.map((e) => (
              <SafetyEventCard key={e.id} event={e} onChanged={refresh} />
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-4" accent="marigold">
        <CardHeader>
          <CardTitle>Open safety reports</CardTitle>
        </CardHeader>
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : tickets.length === 0 ? (
          <p className="text-sm text-ink-soft">No open safety-related reports.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {tickets.map((t) => (
              <div key={t.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">{t.subject}</p>
                    <p className="text-xs text-ink-soft">
                      {t.category} · {t.severity}
                      {t.ride_id && (
                        <>
                          {" · "}
                          <Link href={`/rides/${t.ride_id}`} className="text-signal-blue">
                            View ride
                          </Link>
                        </>
                      )}
                    </p>
                    {t.description && <p className="mt-1 text-xs text-ink-soft">{t.description}</p>}
                  </div>
                  <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => handleTicketResolve(t.id)}>
                    Resolve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
