"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button, Card, StatusPill, PageLoader, ConfirmDialog, Dialog } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getPublicUrl } from "@ride-it/supabase/storage";
import { getRestaurantApplications, adminSetRestaurantStatus, getRestaurantStatusHistory } from "@ride-it/data";
import { RestaurantStatus } from "@ride-it/types";

export default function AdminRestaurantDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [restaurant, setRestaurant] = React.useState<any>(null);
  const [history, setHistory] = React.useState<any[]>([]);
  const [pendingAction, setPendingAction] = React.useState<RestaurantStatus | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(() => {
    getRestaurantApplications(supabase).then((list: any[]) => setRestaurant(list.find((r) => r.id === params.id) ?? null));
    getRestaurantStatusHistory(supabase, params.id).then(setHistory);
  }, [supabase, params.id]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAction() {
    if (!pendingAction) return;
    setBusy(true);
    try {
      await adminSetRestaurantStatus(supabase, params.id, pendingAction, reason || undefined);
      setPendingAction(null);
      setReason("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!restaurant) return <PageLoader />;

  const logoUrl = restaurant.logo_path ? getPublicUrl(supabase, "restaurant-images", restaurant.logo_path) : null;
  const coverUrl = restaurant.cover_image_path ? getPublicUrl(supabase, "restaurant-images", restaurant.cover_image_path) : null;

  return (
    <main className="p-8">
      <button onClick={() => router.push("/food/restaurants")} className="flex items-center gap-1.5 text-sm font-medium text-ink-soft">
        <ArrowLeft size={15} /> Back to applications
      </button>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{restaurant.name}</h1>
          <StatusPill className="mt-2" tone={restaurant.status === "approved" ? "online" : restaurant.status === "rejected" || restaurant.status === "suspended" ? "alert" : "pending"}>
            {restaurant.status.replace(/_/g, " ")}
          </StatusPill>
        </div>
        <div className="flex gap-2">
          {restaurant.status !== "approved" && (
            <Button size="sm" onClick={() => setPendingAction(RestaurantStatus.APPROVED)}>
              Approve
            </Button>
          )}
          {restaurant.status !== "rejected" && (
            <Button size="sm" variant="destructive" onClick={() => setPendingAction(RestaurantStatus.REJECTED)}>
              Reject
            </Button>
          )}
          {restaurant.status === "approved" && (
            <Button size="sm" variant="outline" onClick={() => setPendingAction(RestaurantStatus.SUSPENDED)}>
              Suspend
            </Button>
          )}
          {restaurant.status === "suspended" && (
            <Button size="sm" onClick={() => setPendingAction(RestaurantStatus.APPROVED)}>
              Reactivate
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Owner</p>
          <p className="mt-1 text-sm text-ink">{restaurant.restaurant_owners?.users?.full_name ?? "—"}</p>
          <p className="text-sm text-ink-soft">{restaurant.restaurant_owners?.users?.phone}</p>
          <p className="text-sm text-ink-soft">{restaurant.restaurant_owners?.users?.email}</p>

          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-soft">Restaurant contact</p>
          <p className="mt-1 text-sm text-ink">{restaurant.phone}</p>
          <p className="text-sm text-ink-soft">{restaurant.email}</p>

          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-soft">Address</p>
          <p className="mt-1 text-sm text-ink">{restaurant.address}</p>
          {restaurant.landmark && <p className="text-sm text-ink-soft">{restaurant.landmark}</p>}

          {restaurant.restaurant_verification?.[0]?.business_license_number && (
            <>
              <p className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-soft">Business license</p>
              <p className="mt-1 text-sm text-ink">{restaurant.restaurant_verification[0].business_license_number}</p>
            </>
          )}
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Images</p>
          <div className="mt-2 flex gap-3">
            {logoUrl && <img src={logoUrl} alt="Logo" className="h-20 w-20 rounded-lg object-cover" />}
            {coverUrl && <img src={coverUrl} alt="Cover" className="h-20 w-32 rounded-lg object-cover" />}
            {!logoUrl && !coverUrl && <p className="text-sm text-ink-soft">No images uploaded yet</p>}
          </div>

          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-soft">Status history</p>
          <div className="mt-2 flex flex-col gap-2">
            {history.length === 0 && <p className="text-sm text-ink-soft">No admin actions yet</p>}
            {history.map((h: any) => (
              <div key={h.id} className="text-xs text-ink-soft">
                <span className="font-medium text-ink">{h.new_status}</span> by {h.admin_users?.users?.full_name ?? "admin"} on{" "}
                {new Date(h.created_at).toLocaleString()}
                {h.notes && <span> — {h.notes}</span>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {pendingAction === RestaurantStatus.APPROVED ? (
        <ConfirmDialog
          open={pendingAction !== null}
          onOpenChange={(open) => !open && setPendingAction(null)}
          title="Approve this restaurant?"
          description="The restaurant will still need an active subscription before it can receive orders."
          onConfirm={handleAction}
          loading={busy}
        />
      ) : (
        <Dialog open={pendingAction !== null} onOpenChange={(open) => !open && setPendingAction(null)}>
          <h2 className="font-display text-base font-semibold text-ink">
            {pendingAction === RestaurantStatus.REJECTED ? "Reject" : "Suspend"} this restaurant?
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">A reason is required and will be shown to the restaurant owner.</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            rows={3}
            className="mt-3 w-full resize-none rounded-lg border border-border p-2.5 text-sm text-ink outline-none"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingAction(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy} disabled={!reason.trim()} onClick={handleAction}>
              Confirm
            </Button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
