"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { Button, Input } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { createRestaurant } from "@ride-it/data";
import { getCurrentPositionOnce, fetchGeocode, type LatLng } from "@ride-it/maps";

/**
 * Restaurant registration. Every new row starts pending_verification (RLS
 * enforces this at the database level — restaurants_insert_own_owner — so
 * this form cannot make a restaurant live even if it tried). After this,
 * the owner lands on /dashboard, which shows the pending-approval state
 * until Admin acts on it.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [landmark, setLandmark] = React.useState("");
  const [location, setLocation] = React.useState<LatLng | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getCurrentPositionOnce().then(setLocation).catch(() => {});
  }, []);

  async function resolveLocationFromAddress() {
    if (!address.trim()) return;
    const result = await fetchGeocode(address).catch(() => null);
    if (result) setLocation({ lat: result.lat, lng: result.lng });
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setError("Restaurant name, phone, and address are required.");
      return;
    }
    if (!/^[6-9][0-9]{9}$/.test(phone)) {
      setError("Enter a valid 10-digit phone number.");
      return;
    }
    if (!location) {
      setError("We couldn't determine your restaurant's location. Enable location access or check your address.");
      return;
    }

    setSubmitting(true);
    try {
      await createRestaurant(supabase, {
        name,
        address,
        landmark: landmark || undefined,
        lat: location.lat,
        lng: location.lng,
        phone,
        email: email || undefined,
      });
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't register your restaurant");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-10">
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-tint-blue text-signal-blue">
        <Store size={24} />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold text-ink">Register your restaurant</h1>
      <p className="mt-2 text-sm text-ink-soft">Tell us about your restaurant. Our team will review and approve your application.</p>

      <div className="mt-6 flex flex-col gap-4">
        <Input label="Restaurant name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annapurna Biryani House" />
        <Input
          label="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="10-digit mobile number"
        />
        <Input label="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="restaurant@example.com" />
        <Input
          label="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onBlur={resolveLocationFromAddress}
          placeholder="Full restaurant address"
        />
        <Input label="Landmark (optional)" value={landmark} onChange={(e) => setLandmark(e.target.value)} />
        {!location && <p className="text-xs text-marigold-text">Resolving your restaurant's map location…</p>}

        {error && <p className="text-sm font-medium text-alert-red-text">{error}</p>}

        <Button className="mt-2 w-full" size="lg" loading={submitting} onClick={handleSubmit}>
          Submit application
        </Button>
      </div>
    </main>
  );
}
