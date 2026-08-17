"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getDriverProfile, updateDriverPersonalInfo, type GenderRow } from "@ride-it/data";

const GENDER_OPTIONS: { value: GenderRow; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EditDriverProfilePage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [gender, setGender] = React.useState<GenderRow | "">("");

  React.useEffect(() => {
    if (!user) return;
    getDriverProfile(supabase, user.id).then((profile) => {
      if (profile) {
        setFullName(profile.full_name ?? "");
        setEmail(profile.email ?? "");
        setDateOfBirth(profile.date_of_birth ?? "");
        setGender(profile.gender ?? "");
      }
      setLoading(false);
    });
  }, [supabase, user]);

  const emailValid = EMAIL_SHAPE.test(email.trim());
  const canSave = fullName.trim().length >= 2 && emailValid && dateOfBirth.length > 0 && gender !== "" && !saving;

  async function handleSave() {
    if (!user || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateDriverPersonalInfo(supabase, user.id, {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        dateOfBirth,
        gender: gender as GenderRow,
      });
      router.push("/profile");
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
    <main className="flex flex-1 flex-col px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Personal details</h1>

      <div className="mt-6 flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Full name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-12 w-full rounded-lg border border-border bg-white px-4 text-sm text-ink outline-none focus:border-signal-blue"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="h-12 w-full rounded-lg border border-border bg-white px-4 text-sm text-ink outline-none focus:border-signal-blue"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Date of birth</label>
          <input
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            type="date"
            className="h-12 w-full rounded-lg border border-border bg-white px-4 text-sm text-ink outline-none focus:border-signal-blue"
          />
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

      <div className="mt-auto pt-8">
        <Button className="w-full" disabled={!canSave} onClick={handleSave}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </main>
  );
}
