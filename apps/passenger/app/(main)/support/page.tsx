"use client";

import * as React from "react";
import { LifeBuoy, Plus, X } from "lucide-react";
import { BottomSheet, Button, Card, EmptyState, Select, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  createReport,
  listSupportTicketsForUser,
  PASSENGER_SUPPORT_CATEGORIES,
  type SupportTicketRow,
} from "@ride-it/data";

const STATUS_TONE: Record<string, "alert" | "pending" | "online" | "offline"> = {
  open: "alert",
  in_progress: "pending",
  resolved: "online",
  closed: "offline",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function SupportPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [tickets, setTickets] = React.useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [category, setCategory] = React.useState<string>(PASSENGER_SUPPORT_CATEGORIES[0].value);
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!user) return;
    setTickets(await listSupportTicketsForUser(supabase, user.id));
  }, [supabase, user]);

  React.useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  function openNewTicket() {
    setCategory(PASSENGER_SUPPORT_CATEGORIES[0].value);
    setDescription("");
    setSubmitted(false);
    setSheetOpen(true);
  }

  async function handleSubmit() {
    if (!user || !description.trim()) return;
    setSubmitting(true);
    try {
      const chosen = PASSENGER_SUPPORT_CATEGORIES.find((c) => c.value === category) ?? PASSENGER_SUPPORT_CATEGORIES[0];
      await createReport(supabase, {
        userId: user.id,
        category: chosen.value,
        subject: chosen.label,
        description: description.trim(),
      });
      setSubmitted(true);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tint-blue text-signal-blue">
            <LifeBuoy size={18} aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl font-semibold text-ink">Help &amp; Support</h1>
        </div>
        <button onClick={openNewTicket} aria-label="New support ticket" className="-m-2.5 p-2.5 text-signal-blue">
          <Plus size={22} />
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-soft">Payment issues, lost items, account questions, and app problems.</p>

      <div className="mt-5 flex flex-col gap-3">
        {loading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}

        {!loading && tickets.length === 0 && (
          <EmptyState icon={<LifeBuoy size={20} />} title="No tickets yet" description="Anything you report will show up here so you can track it." />
        )}

        {!loading &&
          tickets.map((t) => (
            <Card key={t.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">{t.subject}</p>
                <StatusPill tone={STATUS_TONE[t.status] ?? "info"}>{STATUS_LABEL[t.status] ?? t.status}</StatusPill>
              </div>
              {t.description && <p className="mt-1 text-xs text-ink-soft">{t.description}</p>}
              <p className="mt-1.5 text-[11px] text-ink-soft">{formatDateTime(t.created_at)}</p>
            </Card>
          ))}
      </div>

      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen}>
        {submitted ? (
          <div className="text-center">
            <p className="text-sm font-medium text-ink">Ticket submitted</p>
            <p className="mt-1 text-xs text-ink-soft">Our team will get back to you. You can track its status here anytime.</p>
            <Button className="mt-4 w-full" onClick={() => setSheetOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">New support ticket</p>
              <button onClick={() => setSheetOpen(false)} aria-label="Close" className="-m-2.5 p-2.5 text-ink-soft">
                <X size={18} />
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <Select label="What's this about?" size="sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                {PASSENGER_SUPPORT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what happened"
                rows={4}
                maxLength={1000}
                aria-label="Description"
                className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm text-ink outline-none focus:border-signal-blue"
              />
              <Button disabled={!description.trim() || submitting} onClick={handleSubmit}>
                {submitting ? "Submitting…" : "Submit ticket"}
              </Button>
            </div>
          </>
        )}
      </BottomSheet>
    </main>
  );
}
