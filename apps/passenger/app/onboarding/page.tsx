"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getPassengerProfile, updatePassengerProfile, isPassengerProfileComplete, type GenderRow } from "@ride-it/data";

const GENDER_OPTIONS: { value: GenderRow; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const PHONE_SHAPE = /^[6-9][0-9]{9}$/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_AGE_YEARS = 13;

function todayMinusYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export default function PassengerOnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [loading, setLoading] = React.useState(true);
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [gender, setGender] = React.useState<GenderRow | "">("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    getPassengerProfile(supabase, user.id).then((profile) => {
      if (profile) {
        setFullName(profile.full_name ?? "");
        setPhone(profile.phone ?? "");
        setEmail(profile.email ?? "");
        setDateOfBirth(profile.date_of_birth ?? "");
        setGender(profile.gender ?? "");
      }
      setLoading(false);
    });
  }, [supabase, user]);

  const phoneValid = phone.trim().length === 0 || PHONE_SHAPE.test(phone.trim());
  const emailValid = EMAIL_SHAPE.test(email.trim());
  const dobValid = dateOfBirth.length > 0 && dateOfBirth <= todayMinusYears(MIN_AGE_YEARS);
  const canSubmit =
    fullName.trim().length >= 2 && phoneValid && phone.trim().length > 0 && emailValid && dobValid && gender !== "" && !saving;

  async function handleSubmit() {
    if (!user || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await updatePassengerProfile(supabase, user.id, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        dateOfBirth,
        gender: gender as GenderRow,
      });
      const updated = await getPassengerProfile(supabase, user.id);
      if (updated && isPassengerProfileComplete(updated)) {
        router.push("/home");
      } else {
        setError("Couldn't save your details. Please try again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your details. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <p className="text-sm text-ink-soft">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="font-display text-2xl font-medium text-ink">A few details before you ride</h1>
        <p className="mt-2 text-sm text-ink-soft">
          We need this to keep your account secure and your rides personal.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="h-12 w-full rounded-lg border border-border bg-white px-4 text-sm text-ink outline-none focus:border-signal-blue"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Mobile number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="98765 43210"
              inputMode="numeric"
              className="h-12 w-full rounded-lg border border-border bg-white px-4 text-sm text-ink outline-none focus:border-signal-blue"
            />
            {phone.trim().length > 0 && !phoneValid && (
              <p className="mt-1 text-xs text-alert-red">Enter a valid 10-digit mobile number.</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              className="h-12 w-full rounded-lg border border-border bg-white px-4 text-sm text-ink outline-none focus:border-signal-blue"
            />
            {email.trim().length > 0 && !emailValid && <p className="mt-1 text-xs text-alert-red">Enter a valid email address.</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Date of birth</label>
            <input
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              type="date"
              max={todayMinusYears(MIN_AGE_YEARS)}
              className="h-12 w-full rounded-lg border border-border bg-white px-4 text-sm text-ink outline-none focus:border-signal-blue"
            />
            {dateOfBirth.length > 0 && !dobValid && (
              <p className="mt-1 text-xs text-alert-red">You must be at least {MIN_AGE_YEARS} years old.</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Gender</label>
            <div className="grid grid-cols-2 gap-2">
              {GENDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
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
        <Button className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
          {saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </main>
  );
}
