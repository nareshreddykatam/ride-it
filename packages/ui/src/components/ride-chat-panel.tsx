"use client";

import * as React from "react";
import { BottomSheet } from "./bottom-sheet";
import { Button } from "./button";
import { Skeleton } from "./skeleton";
import { cn } from "../lib/cn";

export interface RideChatMessageItem {
  id: string;
  message: string;
  createdAt: string;
  /** True if the CURRENT viewer sent this message — drives left/right alignment, never the sender's own identity. */
  fromMe: boolean;
}

export interface RideChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Display name for the other participant — driver's name on Passenger, "your passenger" on Driver (matched-contact names may be withheld until assignment, same privacy boundary the rest of the app already uses). */
  otherPartyName: string;
  messages: RideChatMessageItem[];
  /** Initial page still loading. */
  loading: boolean;
  /** True if an earlier page exists — shows "Load earlier messages". */
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  sending: boolean;
  sendError: string | null;
  onSend: (text: string) => void;
  /** False once the ride has left the sendable window (server re-validates regardless) — the input becomes disabled with `disabledReason` shown instead of hidden, so history stays visible and the reason is explicit. */
  canSend: boolean;
  disabledReason?: string;
  /** Driver-only short canned replies — still go through the same onSend path, no separate mechanism. */
  quickReplies?: string[];
}

function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Ride-scoped chat panel — presentational only. All data fetching,
 * realtime subscription, and mutation calls live in the two app pages
 * that render this (apps/passenger/app/ride/[id]/page.tsx, apps/driver/
 * app/navigation/page.tsx), mirroring the existing RideRequestSheet split
 * (dumb shared UI, app-owned data wiring) rather than duplicating a
 * second data-fetching pattern inside packages/ui.
 */
export function RideChatPanel({
  open,
  onOpenChange,
  otherPartyName,
  messages,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  sending,
  sendError,
  onSend,
  canSend,
  disabledReason,
  quickReplies,
}: RideChatPanelProps) {
  const [draft, setDraft] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);
  const lastMessageCountRef = React.useRef(0);

  // Auto-scroll to the latest message on open and whenever a new message
  // arrives (append), but NOT when older history is prepended via "Load
  // earlier" — that would yank the view away from what the user just
  // scrolled up to read.
  React.useEffect(() => {
    if (!open) return;
    const grew = messages.length > lastMessageCountRef.current;
    const appended = grew && lastMessageCountRef.current !== 0;
    const firstLoad = lastMessageCountRef.current === 0 && messages.length > 0;
    lastMessageCountRef.current = messages.length;
    if ((appended || firstLoad) && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, messages]);

  function handleSend() {
    const text = draft.trim();
    if (!text || sending || !canSend) return;
    onSend(text);
    setDraft("");
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} className="flex h-[85vh] flex-col p-0">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 pb-3 pt-1">
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-ink">Chat</p>
          <p className="truncate text-xs text-ink-soft">{otherPartyName}</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close chat"
          className="-m-2.5 p-2.5 text-ink-soft"
        >
          ✕
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-10 w-3/5 rounded-2xl" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-ink-soft">No messages yet.</p>
            <p className="mt-1 text-xs text-ink-soft">Say hello to {otherPartyName}.</p>
          </div>
        )}

        {!loading && hasMore && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="text-xs font-medium text-signal-blue disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}

        {!loading &&
          messages.map((m) => (
            <div key={m.id} className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm",
                  m.fromMe ? "bg-signal-blue text-white" : "bg-ink/5 text-ink"
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.message}</p>
                <p className={cn("mt-1 text-[10px]", m.fromMe ? "text-white/70" : "text-ink-soft")}>
                  {formatMessageTime(m.createdAt)}
                </p>
              </div>
            </div>
          ))}
      </div>

      {quickReplies && quickReplies.length > 0 && canSend && (
        <div className="shrink-0 overflow-x-auto border-t border-border px-5 pt-2.5">
          <div className="flex gap-2 pb-2.5">
            {quickReplies.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => onSend(q)}
                className="shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-border px-5 py-3">
        {sendError && <p className="mb-2 text-xs text-alert-red">{sendError}</p>}
        {canSend ? (
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message…"
              rows={1}
              maxLength={1000}
              disabled={sending}
              aria-label="Message"
              className="max-h-24 flex-1 resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-signal-blue disabled:opacity-50"
            />
            <Button size="sm" onClick={handleSend} disabled={sending || !draft.trim()} className="shrink-0">
              {sending ? "…" : "Send"}
            </Button>
          </div>
        ) : (
          <p className="text-center text-xs text-ink-soft">{disabledReason ?? "This chat is no longer active."}</p>
        )}
      </div>
    </BottomSheet>
  );
}
