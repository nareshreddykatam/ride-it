"use client";

import * as React from "react";
import { Button, Card, EmptyState, MeterValue, SkeletonRow } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getWallet, listWalletTransactions, type WalletTransactionRow } from "@ride-it/data";
import { Wallet as WalletIcon } from "lucide-react";

const REASON_LABEL: Record<WalletTransactionRow["reason"], string> = {
  ride_earning: "Ride earnings",
  withdrawal: "Withdrawal to bank",
  subscription_payment: "Subscription payment",
  refund: "Refund",
  promo_credit: "Promo credit",
  adjustment: "Adjustment",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function WalletPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [balance, setBalance] = React.useState(0);
  const [transactions, setTransactions] = React.useState<WalletTransactionRow[]>([]);

  React.useEffect(() => {
    if (!user) return;
    getWallet(supabase, user.id)
      .then(async (wallet) => {
        if (!wallet) return;
        setBalance(wallet.balance);
        setTransactions(await listWalletTransactions(supabase, wallet.id));
      })
      .finally(() => setLoading(false));
  }, [supabase, user]);

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Wallet</h1>

      <Card className="mt-4">
        <MeterValue value={`₹${balance}`} label="Available balance" size="lg" />
        {/* Withdrawal requires a trusted server-side flow (wallet writes
            are service-role only, by design — see @ride-it/data/wallet.ts)
            not built this phase. Disabled rather than faking a working flow. */}
        <Button className="mt-4 w-full" disabled title="Bank withdrawal isn't available yet">
          Withdraw to bank
        </Button>
      </Card>

      <div className="mt-6 flex flex-col gap-3">
        {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}

        {!loading && transactions.length === 0 && (
          <EmptyState
            icon={<WalletIcon size={20} />}
            title="No transactions yet"
            description="Ride earnings and subscription charges will show up here."
          />
        )}

        {!loading && transactions.length > 0 && (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-white px-4">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-ink">{tx.description ?? REASON_LABEL[tx.reason]}</p>
                  <p className="text-xs text-ink-soft">{formatDate(tx.created_at)}</p>
                </div>
                <span className={`font-meter text-sm ${tx.type === "credit" ? "text-meter-green" : "text-ink"}`}>
                  {tx.type === "credit" ? "+" : "-"}₹{tx.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
