"use client";

import * as React from "react";
import { Bell } from "lucide-react";
import { Card, EmptyState, SkeletonRow } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listNotifications, markNotificationRead, subscribeToNotifications, type NotificationRow } from "@ride-it/data";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [items, setItems] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    listNotifications(supabase, user.id)
      .then((rows) => active && setItems(rows))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [supabase, user]);

  React.useEffect(() => {
    if (!user) return;
    return subscribeToNotifications(supabase, user.id, (n) => setItems((prev) => [n, ...prev]));
  }, [supabase, user]);

  async function handleTap(n: NotificationRow) {
    if (n.is_read) return;
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)));
    await markNotificationRead(supabase, n.id);
  }

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Notifications</h1>

      <div className="mt-4 flex flex-col gap-3">
        {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}

        {!loading && items.length === 0 && (
          <EmptyState
            icon={<Bell size={20} />}
            title="No notifications yet"
            description="Ride updates, offers, and confirmations will show up here."
          />
        )}

        {!loading &&
          items.map((n) => (
            <button key={n.id} onClick={() => handleTap(n)} className="text-left">
              <Card interactive tone={n.is_read ? "default" : "tinted"} className="flex items-start gap-3">
                <span
                  className={n.is_read ? "mt-1.5 h-2 w-2 shrink-0 rounded-full" : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-signal-blue"}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-ink-soft">{n.body}</p>}
                  <p className="mt-1 text-xs text-ink-soft">{timeAgo(n.created_at)}</p>
                </div>
              </Card>
            </button>
          ))}
      </div>
    </main>
  );
}
