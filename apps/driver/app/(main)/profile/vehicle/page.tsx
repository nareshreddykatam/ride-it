"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Skeleton, StatusPill, VEHICLE_VISUALS } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getActiveVehicle, upsertActiveVehicle, getDriverProfile, type DriverProfileRow } from "@ride-it/data";

const VEHICLE_TYPE_OPTIONS: { value: "bike" | "scooty" | "auto" | "car"; label: string }[] = [
  { value: "bike", label: "Bike" },
  { value: "scooty", label: "Scooty" },
  { value: "auto", label: "Auto" },
  { value: "car", label: "Car" },
];

const PLATE_SHAPE = /^[A-Z0-9-\s]{5,15}$/i;

const VERIFICATION_TONE = {
  approved: "verified",
  pending: "pending",
  in_review: "pending",
  rejected: "alert",
  suspended: "alert",
} as const;

const VERIFICATION_LABEL = {
  approved: "Verified",
  pending: "Pending",
  in_review: "In review",
  rejected: "Rejected",
  suspended: "Suspended",
} as const;

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
  const [verificationStatus, setVerificationStatus] = React.useState<DriverProfileRow["verification_status"] | null>(null);

  React.useEffect(() => {
    if (!user) return;
    Promise.all([getActiveVehicle(supabase, user.id), getDriverProfile(supabase, user.id)]).then(([vehicle, profile]) => {
      if (vehicle) {
        setVehicleType(vehicle.vehicle_type);
        setRegistrationNumber(vehicle.registration_number);
        setMake(vehicle.make ?? "");
        setModel(vehicle.model ?? "");
        setColor(vehicle.color ?? "");
      }
      if (profile) setVerificationStatus(profile.verification_status);
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

  const visuals = VEHICLE_VISUALS[vehicleType];
  const VehicleIcon = visuals.icon;

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Vehicle information</h1>
      <p className="mt-1 text-xs text-ink-soft">Changing your vehicle type may affect the rides you're matched to.</p>

      <div
        className="mt-4 flex items-center gap-3.5 rounded-lg border border-border bg-surface p-4 shadow-sm"
      >
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: visuals.tintVar, color: visuals.colorVar }}
        >
          <VehicleIcon size={32} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-medium text-ink">
            {registrationNumber.trim() || "No registration on file"}
          </p>
          <p className="truncate text-xs text-ink-soft">
            {[make, model, color].filter(Boolean).join(" · ") || visuals.label}
          </p>
          {verificationStatus && (
            <StatusPill tone={VERIFICATION_TONE[verificationStatus]} className="mt-2">
              {VERIFICATION_LABEL[verificationStatus]}
            </StatusPill>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Vehicle type</label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Vehicle type">
            {VEHICLE_TYPE_OPTIONS.map((opt) => {
              const optVisuals = VEHICLE_VISUALS[opt.value];
              const OptIcon = optVisuals.icon;
              const active = vehicleType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setVehicleType(opt.value)}
                  className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-sm transition-colors ${
                    active ? "border-2 font-medium" : "border-border text-ink"
                  }`}
                  style={active ? { borderColor: optVisuals.colorVar, color: optVisuals.textVar } : undefined}
                >
                  <OptIcon size={18} />
                  {opt.label}
                </button>
              );
            })}
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
