"use client";

import * as React from "react";
import { Button, Card, MeterValue } from "@ride-it/ui";

const TRANSACTIONS = [
  { id: "w1", label: "Ride earnings — #rd1", amount: 88, type: "CREDIT", date: "2 Aug 2026" },
  { id: "w2", label: "Withdrawal to bank", amount: -2000, type: "DEBIT", date: "30 Jul 2026" },
  { id: "w3", label: "Ride earnings — #rd2", amount: 142, type: "CREDIT", date: "29 Jul 2026" },
  { id: "w4", label: "Subscription renewal", amount: -999, type: "DEBIT", date: "1 Jul 2026" },
];

export default function WalletPage() {
  const [withdrawing, setWithdrawing] = React.useState(false);
  const balance = 3120;

  async function handleWithdraw() {
    setWithdrawing(true);
    // TODO: wire to a withdrawal endpoint (bank transfer / UPI payout)
    await new Promise((r) => setTimeout(r, 600));
    setWithdrawing(false);
  }

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Wallet</h1>

      <Card className="mt-4">
        <MeterValue value={`₹${balance}`} label="Available balance" size="lg" />
        <Button className="mt-4 w-full" disabled={withdrawing} onClick={handleWithdraw}>
          {withdrawing ? "Processing…" : "Withdraw to bank"}
        </Button>
      </Card>

      <div className="mt-6 flex flex-col divide-y divide-border">
        {TRANSACTIONS.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm text-ink">{tx.label}</p>
              <p className="text-xs text-ink-soft">{tx.date}</p>
            </div>
            <span className={`font-meter text-sm ${tx.amount > 0 ? "text-meter-green" : "text-ink"}`}>
              {tx.amount > 0 ? "+" : ""}₹{tx.amount}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
