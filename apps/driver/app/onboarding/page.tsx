"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Input, Skeleton, VEHICLE_VISUALS } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getDriverProfile,
  updateDriverPersonalInfo,
  isDriverPersonalInfoComplete,
  getActiveVehicle,
  upsertActiveVehicle,
  type GenderRow,
} from "@ride-it/data";

const GENDER_OPTIONS: { value: GenderRow; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const VEHICLE_TYPE_OPTIONS: { value: "bike" | "scooty" | "auto" | "car"; label: string }[] = [
  { value: "bike", label: "Bike" },
  { value: "scooty", label: "Scooty" },
  { value: "auto", label: "Auto" },
  { value: "car", label: "Car" },
];

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_SHAPE = /^[6-9][0-9]{9}$/;
const PLATE_SHAPE = /^[A-Z0-9-\s]{5,15}$/i;
const MIN_AGE_YEARS = 18;

function todayMinusYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export default function DriverOnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [step, setStep] = React.useState<"personal" | "vehicle">("personal");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [gender, setGender] = React.useState<GenderRow | "">("");

  const [vehicleType, setVehicleType] = React.useState<"bike" | "scooty" | "auto" | "car">("auto");
  const [registrationNumber, setRegistrationNumber] = React.useState("");
  const [make, setMake] = React.useState("");
  const [model, setModel] = React.useState("");
  const [color, setColor] = React.useState("");

  React.useEffect(() => {
    if (!user) return;
    Promise.all([getDriverProfile(supabase, user.id), getActiveVehicle(supabase, user.id)]).then(([profile, vehicle]) => {
      if (profile) {
        setFullName(profile.full_name ?? "");
        setPhone(profile.phone ?? "");
        setEmail(profile.email ?? "");
        setDateOfBirth(profile.date_of_birth ?? "");
        setGender(profile.gender ?? "");
        setVehicleType(profile.vehicle_type);
      }
      if (vehicle) {
        setRegistrationNumber(vehicle.registration_number);
        setMake(vehicle.make ?? "");
        setModel(vehicle.model ?? "");
        setColor(vehicle.color ?? "");
      }
      setLoading(false);
    });
  }, [supabase, user]);

  const phoneValid = phone.trim().length > 0 && PHONE_SHAPE.test(phone.trim());
  const emailValid = EMAIL_SHAPE.test(email.trim());
  const dobValid = dateOfBirth.length > 0 && dateOfBirth <= todayMinusYears(MIN_AGE_YEARS);
  const personalValid = fullName.trim().length >= 2 && phoneValid && emailValid && dobValid && gender !== "";
  const plateValid = PLATE_SHAPE.test(registrationNumber.trim());
  const vehicleValid = plateValid;

  async function handlePersonalContinue() {
    if (!user || !personalValid) return;
    setSaving(true);
    setError(null);
    try {
      await updateDriverPersonalInfo(supabase, user.id, {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        dateOfBirth,
        gender: gender as GenderRow,
      });
      setStep("vehicle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your details. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleVehicleContinue() {
    if (!user || !vehicleValid) return;
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
      const profile = await getDriverProfile(supabase, user.id);
      if (profile && isDriverPersonalInfoComplete(profile)) {
        router.push("/documents");
      } else {
        setError("Couldn't save your details. Please try again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your vehicle. Check the registration number and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 flex-col gap-4 px-6 py-10">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-56" />
        <div className="mt-4 flex flex-col gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </main>
    );
  }

  if (step === "personal") {
    return (
      <main className="flex flex-1 flex-col px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full w-1/2 rounded-full bg-signal-blue" />
            </div>
            <p className="shrink-0 text-xs font-medium text-ink-soft">1 of 2</p>
          </div>
          <h1 className="mt-4 font-display text-2xl font-medium text-ink">Tell us about yourself</h1>

          <div className="mt-6 flex flex-col gap-4">
            <Input
              label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
            <Input
              label="Mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="98765 43210"
              inputMode="numeric"
            />
            <Input
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
            />
            <Input
              label="Date of birth"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              type="date"
              max={todayMinusYears(MIN_AGE_YEARS)}
              error={dateOfBirth.length > 0 && !dobValid ? `Drivers must be at least ${MIN_AGE_YEARS} years old.` : undefined}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Gender</label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Gender">
                {GENDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={gender === opt.value}
                    onClick={() => setGender(opt.value)}
                    className={`h-11 rounded-lg border text-sm ${
                      gender === opt.value ? "border-2 border-signal-blue font-medium text-signal-blue" : "border-border text-ink"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-xs text-alert-red">{error}</p>}
          </div>
        </motion.div>
        <div className="mt-auto pt-8">
          <Button className="w-full" disabled={!personalValid || saving} onClick={handlePersonalContinue}>
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full w-full rounded-full bg-signal-blue" />
          </div>
          <p className="shrink-0 text-xs font-medium text-ink-soft">2 of 2</p>
        </div>
        <h1 className="mt-4 font-display text-2xl font-medium text-ink">Your vehicle</h1>

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
            error={
              registrationNumber.trim().length > 0 && !plateValid
                ? "Enter a valid registration/number plate."
                : undefined
            }
          />
          <Input
            label="Make (optional)"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="Honda, Bajaj, Maruti…"
          />
          <Input
            label="Model (optional)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Activa, Pulsar, Swift…"
          />
          <Input
            label="Colour (optional)"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="White, Black, Red…"
          />
          {error && <p className="text-xs text-alert-red">{error}</p>}
        </div>
      </motion.div>
      <div className="mt-auto flex gap-3 pt-8">
        <Button variant="outline" className="flex-1" onClick={() => setStep("personal")} disabled={saving}>
          Back
        </Button>
        <Button className="flex-1" disabled={!vehicleValid || saving} onClick={handleVehicleContinue}>
          {saving ? "Saving…" : "Continue to documents"}
        </Button>
      </div>
    </main>
  );
}
