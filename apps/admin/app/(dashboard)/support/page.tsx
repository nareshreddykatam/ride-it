"use client";

import * as React from "react";
import Link from "next/link";
import { Button, Card, ConfirmDialog, EmptyState, Select, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  listAllSupportTicketsAdmin,
  setSupportTicketStatusAdmin,
  assignSupportTicket,
  listSupportTicketNotes,
  addSupportTicketNoteAdmin,
  type AdminSupportTicketRow,
  type SupportTicketNoteRow,
} from "@ride-it/data";
import { ChevronDown, ChevronUp, LifeBuoy } from "lucide-react";

const STATUS_TONE: Record<string, "alert" | "pending" | "online" | "offline"> = {
  open: "alert",
  in_progress: "pending",
  resolved: "online",
  closed: "offline",
};

const SEVERITY_TONE: Record<string, "offline" | "info" | "pending" | "alert"> = {
  low: "offline",
  medium: "info",
  high: "pending",
  critical: "alert",
};

const CATEGORIES = [
  "safety",
  "driver_issue",
  "passenger_issue",
  "ride_issue",
  "payment_issue",
  "account",
  "driver_verification",
  "lost_item",
  "app_problem",
  "inappropriate_review",
  "other",
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

interface TicketCardProps {
  ticket: AdminSupportTicketRow;
  currentAdminId: string;
  onChanged: () => void;
}

function TicketCard({ ticket, currentAdminId, onChanged }: TicketCardProps) {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [busy, setBusy] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [notes, setNotes] = React.useState<SupportTicketNoteRow[] | null>(null);
  const [noteText, setNoteText] = React.useState("");
  const [confirmAction, setConfirmAction] = React.useState<"resolved" | "closed" | null>(null);

  async function loadHistory() {
    setNotes(await listSupportTicketNotes(supabase, ticket.id));
  }

  async function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && notes === null) await loadHistory();
  }

  async function transition(status: "open" | "in_progress" | "resolved" | "closed") {
    setBusy(true);
    try {
      await setSupportTicketStatusAdmin(supabase, ticket.id, status);
      if (historyOpen) await loadHistory();
      onChanged();
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function handleAssignToMe() {
    setBusy(true);
    try {
      await assignSupportTicket(supabase, ticket.id, currentAdminId);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function submitNote() {
    if (!noteText.trim()) return;
    setBusy(true);
    try {
      await addSupportTicketNoteAdmin(supabase, ticket.id, noteText.trim());
      setNoteText("");
      await loadHistory();
    } finally {
      setBusy(false);
    }
  }

  const isTerminal = ticket.status === "closed";

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{ticket.subject}</p>
          <p className="text-xs text-ink-soft">
            #{shortId(ticket.id)} · {ticket.category} · {ticket.user_name ?? "Unknown user"} · {formatDateTime(ticket.created_at)}
            {ticket.ride_id && (
              <>
                {" · "}
                <Link href={`/rides/${ticket.ride_id}`} className="text-signal-blue">
                  View ride
                </Link>
              </>
            )}
          </p>
          {ticket.description && <p className="mt-1 text-xs text-ink-soft">{ticket.description}</p>}
          <p className="mt-1 text-xs text-ink-soft">
            Assigned to: {ticket.assigned_admin_name ?? <span className="italic">Unassigned</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusPill tone={SEVERITY_TONE[ticket.severity] ?? "info"}>{ticket.severity}</StatusPill>
          <StatusPill tone={STATUS_TONE[ticket.status] ?? "info"}>{ticket.status}</StatusPill>
        </div>
      </div>

      {!isTerminal && (
        <div className="mt-2 flex flex-wrap gap-2">
          {!ticket.assigned_admin_id && (
            <Button size="sm" variant="outline" disabled={busy} onClick={handleAssignToMe}>
              Assign to me
            </Button>
          )}
          {ticket.status === "open" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => transition("in_progress")}>
              Start progress
            </Button>
          )}
          {ticket.status !== "resolved" && (
            <Button size="sm" disabled={busy} onClick={() => setConfirmAction("resolved")}>
              Resolve
            </Button>
          )}
        </div>
      )}
      {ticket.status === "resolved" && (
        <div className="mt-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmAction("closed")}>
            Close
          </Button>
        </div>
      )}

      <button type="button" onClick={toggleHistory} className="mt-2 flex items-center gap-1 text-xs font-medium text-signal-blue">
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
                  {n.status_transition_to && <span className="ml-1.5 text-ink-soft">→ {n.status_transition_to}</span>}
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
                placeholder="Add an internal note…"
                aria-label="Add an internal note"
                className="h-8 flex-1 rounded-lg border border-border bg-surface px-2.5 text-xs text-ink outline-none focus:border-signal-blue"
              />
              <Button size="sm" variant="outline" disabled={busy || !noteText.trim()} onClick={submitNote}>
                Add
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction === "closed" ? "Close this ticket?" : "Resolve this ticket?"}
        description={
          confirmAction === "closed"
            ? "Closing marks this ticket fully done. It can still be reopened later if needed."
            : "This marks the issue handled. The filer will be notified."
        }
        confirmLabel={confirmAction === "closed" ? "Close ticket" : "Resolve"}
        tone={confirmAction === "closed" ? "destructive" : "default"}
        loading={busy}
        onConfirm={async () => {
          if (confirmAction) await transition(confirmAction);
        }}
      />
    </div>
  );
}

export default function AdminSupportPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [tickets, setTickets] = React.useState<AdminSupportTicketRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState("open");
  const [categoryFilter, setCategoryFilter] = React.useState("all");

  const refresh = React.useCallback(async () => {
    const filters: { status?: string; category?: string } = {};
    if (statusFilter !== "all") filters.status = statusFilter;
    if (categoryFilter !== "all") filters.category = categoryFilter;
    setTickets(await listAllSupportTicketsAdmin(supabase, filters));
  }, [supabase, statusFilter, categoryFilter]);

  React.useEffect(() => {
    if (!user) return;
    refresh().finally(() => setLoading(false));
  }, [user, refresh]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-blue text-signal-blue">
          <LifeBuoy size={20} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Support</h1>
          <p className="text-sm text-ink-soft">Every ticket passengers and drivers have filed — assign, work, and resolve.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
          {["open", "in_progress", "resolved", "closed", "all"].map((s) => (
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
              {s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}
            </button>
          ))}
        </div>
        <Select
          size="sm"
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-44"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace("_", " ")}
            </option>
          ))}
        </Select>
      </div>

      <Card className="mt-4">
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : tickets.length === 0 ? (
          <EmptyState icon={<LifeBuoy size={20} />} title="No tickets" description="Nothing matches this filter right now." />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {tickets.map((t) => (
              <TicketCard key={t.id} ticket={t} currentAdminId={user?.id ?? ""} onChanged={refresh} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
