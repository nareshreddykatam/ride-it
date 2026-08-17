"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Switch } from "@ride-it/ui";
import { PaymentMethod } from "@ride-it/types";

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm text-ink">{label}</p>
        {description && <p className="text-xs text-ink-soft">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} label={label} />
    </div>
  );
}

export default function SettingsPage() {
  const [rideUpdates, setRideUpdates] = React.useState(true);
  const [offers, setOffers] = React.useState(true);
  const [paymentConfirm, setPaymentConfirm] = React.useState(true);
  const [defaultPayment, setDefaultPayment] = React.useState<PaymentMethod>(PaymentMethod.CASH);

  return (
    <main className="flex-1 px-6 py-8">
      <div className="flex items-center gap-2">
        <Link href="/profile" aria-label="Back" className="-m-2.5 p-2.5 text-ink-soft">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-medium text-ink">Settings</h1>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-ink-soft">Notifications</p>
        <div className="mt-1 divide-y divide-border rounded-lg border border-border bg-white px-4">
          <ToggleRow label="Ride status" description="Driver arrival, ride start, completion" checked={rideUpdates} onChange={setRideUpdates} />
          <ToggleRow label="Offers & promotions" checked={offers} onChange={setOffers} />
          <ToggleRow label="Payment confirmations" checked={paymentConfirm} onChange={setPaymentConfirm} />
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-ink-soft">Default payment method</p>
        <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Default payment method">
          {[PaymentMethod.CASH, PaymentMethod.DRIVER_UPI].map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={defaultPayment === m}
              onClick={() => setDefaultPayment(m)}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-sm ${
                defaultPayment === m ? "border-2 border-signal-blue text-ink" : "border-border text-ink-soft"
              } bg-white`}
            >
              {m === PaymentMethod.CASH ? "Cash" : "Driver UPI"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-ink-soft">Language</p>
        <div className="mt-1 rounded-lg border border-border bg-white px-4 py-3 text-sm text-ink">
          English
          <span className="ml-2 text-xs text-ink-soft">
            (only supported language — full list pending confirmation)
          </span>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-ink-soft">Ride It Passenger v1.4.2</p>
    </main>
  );
}
