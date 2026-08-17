"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Skeleton } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getActiveVehicle, upsertActiveVehicle } from "@ride-it/data";

const VEHICLE_TYPE_OPTIONS: { value: "bike" | "scooty" | "auto" | "car"; label: string }[] = [
  { value: "bike", label: "Bike" },
  { value: "scooty", label: "Scooty" },
  { value: "auto", label: "Auto" },
  { value: "car", label: "Car" },
];

const PLATE_SHAPE = /^[A-Z0-9-\s]{5,15}$/i;

export default function DriverVehiclePage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [vehicleType, setVehicleType] = React.useState<"bike" | "scooty" | "auto" | "car">("auto");
  const [registrationNumber, setRegistrationNumber] = React.useState("");
  const [make, setMake] = React.useState("");
  const [model, setModel] = React.useState("");
  const [color, setColor] = React.useState("");

  React.useEffect(() => {
    if (!user) return;
    getActiveVehicle(supabase, user.id).then((vehicle) => {
      if (vehicle) {
        setVehicleType(vehicle.vehicle_type);
        setRegistrationNumber(vehicle.registration_number);
        setMake(vehicle.make ?? "");
        setModel(vehicle.model ?? "");
        setColor(vehicle.color ?? "");
      }
      setLoading(false);
    });
  }, [supabase, user]);

  const plateValid = PLATE_SHAPE.test(registrationNumber.trim());

  async function handleSave() {
    if (!user || !plateValid) return;
    setSaving(true);
    setError(null);
    try {
      await upsertActiveVehicle(supabase, {
        driverId: user.id,
        vehicleType,
        registrationNumber: registrationNumber.trim().toUpperCase(),
        make: make.trim() || undefined,
        model: model.trim() || undefined,
        color: color.trim() || undefined,
      });
      router.push("/profile");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your vehicle. Check the registration number and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 flex-col gap-4 px-6 py-10">
        <Skeleton className="h-8 w-56" />
        <div className="mt-4 flex flex-col gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Vehicle information</h1>
      <p className="mt-1 text-xs text-ink-soft">Changing your vehicle type may affect the rides you're matched to.</p>

      <div className="mt-6 flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Vehicle type</label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Vehicle type">
            {VEHICLE_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={vehicleType === opt.value}
                onClick={() => setVehicleType(opt.value)}
                className={`h-11 rounded-lg border text-sm ${
                  vehicleType === opt.value ? "border-2 border-signal-blue font-medium text-signal-blue" : "border-border text-ink"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <Input
          label="Registration number"
          value={registrationNumber}
          onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
          placeholder="TS 09 AB 1234"
          error={registrationNumber.trim().length > 0 && !plateValid ? "Enter a valid registration/number plate." : undefined}
        />
        <Input label="Make (optional)" value={make} onChange={(e) => setMake(e.target.value)} />
        <Input label="Model (optional)" value={model} onChange={(e) => setModel(e.target.value)} />
        <Input label="Colour (optional)" value={color} onChange={(e) => setColor(e.target.value)} />
        {error && <p className="text-xs text-alert-red">{error}</p>}
      </div>

      <div className="mt-auto pt-8">
        <Button className="w-full" disabled={!plateValid || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </main>
  );
}
