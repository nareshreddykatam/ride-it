"use client";

import * as React from "react";
import Link from "next/link";
import { Button, Card, CardHeader, CardTitle, EmptyState, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  listSafetyEventsAdmin,
  setSafetyEventStatusAdmin,
  listSupportTicketsAdmin,
  updateSupportTicketStatus,
  type AdminSafetyEventRow,
  type SupportTicketRow,
} from "@ride-it/data";
import { LifeBuoy } from "lucide-react";

const SAFETY_EVENT_TONE: Record<string, "pending" | "info" | "online" | "alert"> = {
  open: "alert",
  acknowledged: "pending",
  investigating: "pending",
  resolved: "online",
  closed: "online",
};

const SAFETY_CATEGORIES = ["safety", "driver_issue", "passenger_issue", "inappropriate_review"];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function SafetyDashboardPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [events, setEvents] = React.useState<AdminSafetyEventRow[]>([]);
  const [tickets, setTickets] = React.useState<SupportTicketRow[]>([]);
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

  async function handleEventStatus(eventId: string, status: "acknowledged" | "investigating" | "resolved" | "closed") {
    setBusy(eventId);
    try {
      await setSafetyEventStatusAdmin(supabase, eventId, status);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

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
      <h1 className="font-display text-2xl font-medium text-ink">Safety</h1>
      <p className="mt-1 text-sm text-ink-soft">
        SOS events and safety-related reports. Ride It has no automated emergency-service integration — every event
        here requires human review.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by event status">
        {["open", "acknowledged", "investigating", "resolved", "all"].map((s) => (
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

      <Card className="mt-4">
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
              <div key={e.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {e.user_name ?? "Unknown user"} <span className="text-ink-soft">({e.triggered_by_role})</span>
                    </p>
                    <p className="text-xs text-ink-soft">
                      {formatDateTime(e.created_at)}
                      {e.ride_id && (
                        <>
                          {" · "}
                          <Link href={`/rides/${e.ride_id}`} className="text-signal-blue">
                            View ride
                          </Link>
                        </>
                      )}
                      {e.latitude != null && e.longitude != null && ` · ${e.latitude.toFixed(4)}, ${e.longitude.toFixed(4)}`}
                    </p>
                  </div>
                  <StatusPill tone={SAFETY_EVENT_TONE[e.status] ?? "info"}>{e.status}</StatusPill>
                </div>
                {e.status !== "resolved" && e.status !== "closed" && (
                  <div className="mt-2 flex gap-2">
                    {e.status === "open" && (
                      <Button size="sm" variant="outline" disabled={busy === e.id} onClick={() => handleEventStatus(e.id, "acknowledged")}>
                        Acknowledge
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={busy === e.id} onClick={() => handleEventStatus(e.id, "investigating")}>
                      Investigating
                    </Button>
                    <Button size="sm" disabled={busy === e.id} onClick={() => handleEventStatus(e.id, "resolved")}>
                      Resolve
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-4">
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
