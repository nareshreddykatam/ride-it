"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Banknote, Smartphone } from "lucide-react";
import { Button, Card, MeterValue, cn } from "@ride-it/ui";
import { PaymentMethod } from "@ride-it/types";

// Placeholder — wire to ridesApi.getRide(rideId) once the ride-completed
// event arrives over the realtime layer.
const DEMO_FARE = { baseFare: 25, distanceFare: 63, totalFare: 88 };

const METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: PaymentMethod.CASH, label: "Cash", icon: Banknote },
  { value: PaymentMethod.UPI, label: "UPI", icon: Smartphone },
];

export default function RideCompletePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [method, setMethod] = React.useState<PaymentMethod>(PaymentMethod.CASH);
  const [paying, setPaying] = React.useState(false);

  async function handleConfirmPayment() {
    setPaying(true);
    // TODO: wire to a payments endpoint — CASH just marks the ride settled,
    // UPI would open the Razorpay checkout before marking it settled.
    await new Promise((r) => setTimeout(r, 500));
    router.push(`/ride/${params.id}/rate`);
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="font-display text-2xl font-medium text-ink">Ride completed</h1>
        <p className="mt-1 text-sm text-ink-soft">Here&apos;s your fare breakdown.</p>

        <Card className="mt-6">
          <div className="flex items-center justify-between text-sm text-ink-soft">
            <span>Base fare</span>
            <span className="font-meter text-ink">₹{DEMO_FARE.baseFare}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm text-ink-soft">
            <span>Distance fare</span>
            <span className="font-meter text-ink">₹{DEMO_FARE.distanceFare}</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-medium text-ink">Total</span>
            <MeterValue value={`₹${DEMO_FARE.totalFare}`} size="md" />
          </div>
        </Card>

        <p className="mt-6 text-sm font-medium text-ink">Pay with</p>
        <div className="mt-2 flex gap-3">
          {METHODS.map(({ value, label, icon: Icon }) => {
            const active = method === value;
            return (
              <button key={value} onClick={() => setMethod(value)} className="flex-1">
                <div
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border bg-white py-4",
                    active ? "border-2 border-signal-blue" : "border-border"
                  )}
                >
                  <Icon size={20} className={active ? "text-signal-blue" : "text-ink-soft"} />
                  <span className="text-sm text-ink">{label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>

      <div className="mt-auto pt-8">
        <Button className="w-full" disabled={paying} onClick={handleConfirmPayment}>
          {paying
            ? "Confirming…"
            : method === PaymentMethod.CASH
              ? "Confirm cash payment"
              : "Pay with UPI"}
        </Button>
      </div>
    </main>
  );
}
