"use client";

import * as React from "react";
import { StatusPill, Button, ConfirmDialog } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getAllFoodOrdersForAdmin, adminCancelFoodOrder } from "@ride-it/data";
import { DataTable, type Column } from "../../../../components/data-table";

interface Row {
  id: string;
  status: string;
  payment_method: string;
  payment_status: string;
  total_amount: number;
  recipient_name: string;
  recipient_phone: string;
  created_at: string;
  restaurants: { name: string } | null;
}

const STATUS_TONE: Record<string, "online" | "pending" | "alert" | "info" | "offline"> = {
  placed: "pending",
  delivered: "online",
  cancelled: "offline",
  rejected: "alert",
  failed: "alert",
};

export default function AdminFoodOrdersPage() {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(() => {
    getAllFoodOrdersForAdmin(supabase).then((data) => setRows(data as unknown as Row[]));
  }, [supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCancel() {
    if (!cancellingId) return;
    setBusy(true);
    try {
      await adminCancelFoodOrder(supabase, cancellingId, "Cancelled by admin");
      setCancellingId(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Row>[] = [
    { key: "id", header: "Order", render: (r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}</span> },
    { key: "restaurant", header: "Restaurant", render: (r) => r.restaurants?.name ?? "—" },
    { key: "recipient", header: "Recipient", render: (r) => `${r.recipient_name} · ${r.recipient_phone}` },
    { key: "amount", header: "Amount", render: (r) => `₹${r.total_amount}` },
    { key: "payment", header: "Payment", render: (r) => `${r.payment_method.toUpperCase()} · ${r.payment_status}` },
    { key: "status", header: "Status", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "info"}>{r.status.replace(/_/g, " ")}</StatusPill> },
    { key: "created_at", header: "Placed", render: (r) => new Date(r.created_at).toLocaleString() },
    {
      key: "actions",
      header: "",
      render: (r) =>
        !["delivered", "cancelled", "rejected"].includes(r.status) ? (
          <Button size="sm" variant="outline" onClick={() => setCancellingId(r.id)}>
            Cancel
          </Button>
        ) : null,
    },
  ];

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-bold text-ink">Food Orders</h1>
      <div className="mt-6">
        <DataTable columns={columns} rows={rows ?? []} keyField={(r) => r.id} loading={rows === null} ariaLabel="Food orders" />
      </div>

      <ConfirmDialog
        open={cancellingId !== null}
        onOpenChange={(open) => !open && setCancellingId(null)}
        title="Force-cancel this order?"
        description="This overrides the normal order flow. Use only for genuine operational issues."
        tone="destructive"
        confirmLabel="Cancel order"
        onConfirm={handleCancel}
        loading={busy}
      />
    </main>
  );
}
