"use client";

import * as React from "react";
import { Button, Card, CardHeader, CardTitle, ConfirmDialog, Skeleton, StatusPill } from "@ride-it/ui";
import { Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { VEHICLE_TYPE_LABELS_DB } from "@ride-it/types";
import {
  listAppSettingsAdmin,
  updateAppSetting,
  listPricingRulesAdmin,
  updatePricingRule,
  createPricingRule,
  getAdminSurgeRecommendation,
  type AppSettingRow,
  type PricingRuleRow,
  type SurgeRecommendationRow,
} from "@ride-it/data";

// The authoritative vehicle-type set — read from the same source every
// other part of the product uses (driver vehicle registration, the fare
// estimate mirror, ride records), not a second hardcoded list that could
// drift from it. If a vehicle type is ever added there, it appears here
// automatically.
const VEHICLE_TYPES = Object.keys(VEHICLE_TYPE_LABELS_DB) as (keyof typeof VEHICLE_TYPE_LABELS_DB)[];

export default function SettingsPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [settings, setSettings] = React.useState<Record<string, AppSettingRow>>({});
  const [pricing, setPricing] = React.useState<PricingRuleRow[]>([]);
  const [surgeRecs, setSurgeRecs] = React.useState<SurgeRecommendationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [confirmMaintenanceOpen, setConfirmMaintenanceOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [s, p, sr] = await Promise.all([
      listAppSettingsAdmin(supabase),
      listPricingRulesAdmin(supabase),
      getAdminSurgeRecommendation(supabase),
    ]);
    setSettings(Object.fromEntries(s.map((row) => [row.key, row])));
    setPricing(p);
    setSurgeRecs(sr);
  }, [supabase]);

  React.useEffect(() => {
    if (!user) return;
    refresh().finally(() => setLoading(false));
  }, [user, refresh]);

  async function handleToggleMaintenance() {
    if (!user) return;
    const current = settings.maintenance_mode?.value === true;
    setSaving("maintenance_mode");
    try {
      await updateAppSetting(supabase, "maintenance_mode", !current, user.id);
      setConfirmMaintenanceOpen(false);
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handlePricingSave(rule: PricingRuleRow, baseFare: number, perKmRate: number) {
    setSaving(rule.id);
    try {
      await updatePricingRule(supabase, rule.id, { baseFare, perKmRate });
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handlePricingToggleActive(rule: PricingRuleRow) {
    setSaving(rule.id);
    try {
      await updatePricingRule(supabase, rule.id, { isActive: !rule.is_active });
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handlePricingCreate(vehicleType: PricingRuleRow["vehicle_type"], baseFare: number, perKmRate: number) {
    setSaving(vehicleType);
    try {
      await createPricingRule(supabase, vehicleType, baseFare, perKmRate);
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handleSurgeMultiplierSave(rule: PricingRuleRow, multiplier: number) {
    setSaving(`surge-${rule.id}`);
    try {
      await updatePricingRule(supabase, rule.id, { surgeMultiplier: multiplier });
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handleApplyRecommendation(rule: PricingRuleRow, suggested: number) {
    setSaving(`surge-${rule.id}`);
    try {
      await updatePricingRule(supabase, rule.id, { surgeMultiplier: suggested });
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handleToggleSurge() {
    if (!user) return;
    const current = settings.surge_enabled?.value === true;
    setSaving("surge_enabled");
    try {
      await updateAppSetting(supabase, "surge_enabled", !current, user.id);
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handleSurgeMaxSave(value: number) {
    if (!user) return;
    setSaving("surge_max_multiplier");
    try {
      await updateAppSetting(supabase, "surge_max_multiplier", value, user.id);
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handleSurgeWindowSave(key: "surge_starts_at" | "surge_ends_at", value: string) {
    if (!user) return;
    setSaving(key);
    try {
      // Empty input clears the schedule (back to manual on/off only) —
      // stored as JSON null, matching the migration's own default.
      await updateAppSetting(supabase, key, value ? new Date(value).toISOString() : null, user.id);
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handleToggleReferrals() {
    if (!user) return;
    setSaving("referral_enabled");
    try {
      await updateAppSetting(supabase, "referral_enabled", !referralEnabled, user.id);
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handleReferralRewardSave(key: string, amount: number) {
    if (!user) return;
    setSaving(key);
    try {
      await updateAppSetting(supabase, key, amount, user.id);
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div>
        <Skeleton className="h-6 w-32" />
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const maintenanceOn = settings.maintenance_mode?.value === true;
  const languages = (settings.supported_languages?.value as string[] | undefined) ?? ["en"];
  const referralEnabled = settings.referral_enabled?.value === true;
  const surgeEnabled = settings.surge_enabled?.value === true;
  const surgeMax = Number(settings.surge_max_multiplier?.value ?? 2);
  const surgeStartsAt = (settings.surge_starts_at?.value as string | null) ?? null;
  const surgeEndsAt = (settings.surge_ends_at?.value as string | null) ?? null;
  // Same window logic compute_ride_fare()/get_surge_status() use server-side
  // — purely for an at-a-glance "is surge ACTUALLY in effect right now"
  // label; the server, not this computation, is what's ever enforced.
  const surgeInWindow =
    (!surgeStartsAt || new Date(surgeStartsAt) <= new Date()) && (!surgeEndsAt || new Date(surgeEndsAt) >= new Date());
  const surgeCurrentlyActive = surgeEnabled && surgeInWindow;

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-blue text-signal-blue">
          <SettingsIcon size={20} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Settings</h1>
          <p className="text-sm text-ink-soft">
            Platform-wide configuration. Changes here affect all Passenger and Driver apps.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card accent="marigold">
          <CardHeader>
            <CardTitle>Vehicle pricing</CardTitle>
          </CardHeader>
          <p className="mb-3 text-xs text-ink-soft">Base fare + per-km, per vehicle type. Surge multipliers are configured separately below.</p>
          <div className="space-y-3">
            {VEHICLE_TYPES.map((vehicleType) => {
              // Prefer the active rule if one exists; otherwise fall back
              // to whichever row is present (deactivated) so it's still
              // editable/re-activatable rather than looking identical to
              // a vehicle with no rule at all.
              const rulesForType = pricing.filter((r) => r.vehicle_type === vehicleType);
              const rule = rulesForType.find((r) => r.is_active) ?? rulesForType[0];
              return (
                <PricingRow
                  key={vehicleType}
                  vehicleType={vehicleType}
                  rule={rule}
                  saving={saving === (rule?.id ?? vehicleType)}
                  onSave={handlePricingSave}
                  onToggleActive={handlePricingToggleActive}
                  onCreate={handlePricingCreate}
                />
              );
            })}
          </div>
        </Card>

        <Card accent={surgeCurrentlyActive ? "red" : undefined}>
          <CardHeader>
            <CardTitle>Surge control</CardTitle>
            <StatusPill tone={surgeCurrentlyActive ? "alert" : "pending"}>
              {surgeCurrentlyActive ? "ACTIVE" : surgeEnabled ? "ENABLED (outside window)" : "OFF"}
            </StatusPill>
          </CardHeader>
          <p className="mb-3 text-xs text-ink-soft">
            Multiplies base + distance fare per vehicle type while enabled. Server-enforced regardless of what any
            client requests — see compute_ride_fare().
          </p>
          <div className="space-y-3">
            {VEHICLE_TYPES.map((vehicleType) => {
              const rulesForType = pricing.filter((r) => r.vehicle_type === vehicleType);
              const rule = rulesForType.find((r) => r.is_active) ?? rulesForType[0];
              const rec = surgeRecs.find((r) => r.vehicle_type === vehicleType);
              return (
                <SurgeMultiplierRow
                  key={vehicleType}
                  vehicleType={vehicleType}
                  rule={rule}
                  maxMultiplier={surgeMax}
                  recommendation={rec}
                  saving={saving === `surge-${rule?.id}`}
                  onSave={handleSurgeMultiplierSave}
                  onApplyRecommendation={handleApplyRecommendation}
                />
              );
            })}
          </div>

          <div className="mt-4 space-y-2 border-t border-border/60 pt-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-soft">Maximum allowed multiplier</span>
              <MaxMultiplierEditor value={surgeMax} saving={saving === "surge_max_multiplier"} onSave={handleSurgeMaxSave} />
            </div>
            <p className="text-xs text-ink-soft">
              Scope: platform-wide (no per-city/zone pricing exists yet — see final report). Hard safety ceiling: 5.00x, enforced regardless of this setting.
            </p>
            <SurgeWindowEditor
              startsAt={surgeStartsAt}
              endsAt={surgeEndsAt}
              savingKey={saving}
              onSave={handleSurgeWindowSave}
            />
          </div>

          <Button
            size="sm"
            variant={surgeEnabled ? "outline" : "destructive"}
            className="mt-4 w-full"
            disabled={saving === "surge_enabled"}
            onClick={handleToggleSurge}
          >
            {surgeEnabled ? "Turn off surge" : "Turn on surge"}
          </Button>
        </Card>

        <Card accent={maintenanceOn ? "red" : "green"}>
          <CardHeader>
            <CardTitle>Maintenance mode</CardTitle>
            <StatusPill tone={maintenanceOn ? "alert" : "online"}>{maintenanceOn ? "Enabled" : "Disabled"}</StatusPill>
          </CardHeader>
          <p className="text-sm text-ink-soft">
            Temporarily blocks new bookings across Passenger and Driver apps during planned downtime.
          </p>
          <Button
            size="sm"
            variant={maintenanceOn ? "outline" : "destructive"}
            className="mt-4"
            disabled={saving === "maintenance_mode"}
            onClick={() => (maintenanceOn ? handleToggleMaintenance() : setConfirmMaintenanceOpen(true))}
          >
            {maintenanceOn ? "Turn off maintenance mode" : "Turn on maintenance mode"}
          </Button>
        </Card>

        <Card accent={referralEnabled ? "green" : undefined}>
          <CardHeader>
            <CardTitle>Referral rewards</CardTitle>
            <StatusPill tone={referralEnabled ? "online" : "pending"}>{referralEnabled ? "Enabled" : "Disabled"}</StatusPill>
          </CardHeader>
          <p className="mb-3 text-xs text-ink-soft">
            Reward the inviter once their invitee completes a qualifying ride. Requires {String(settings.referral_required_completed_rides?.value ?? 1)} completed ride(s).
          </p>
          <div className="space-y-3">
            <ReferralRewardRow
              label="Passenger → Passenger"
              settingKey="referral_passenger_to_passenger_reward"
              value={Number(settings.referral_passenger_to_passenger_reward?.value ?? 0)}
              saving={saving === "referral_passenger_to_passenger_reward"}
              onSave={handleReferralRewardSave}
            />
            <ReferralRewardRow
              label="Passenger → Driver"
              settingKey="referral_passenger_to_driver_reward"
              value={Number(settings.referral_passenger_to_driver_reward?.value ?? 0)}
              saving={saving === "referral_passenger_to_driver_reward"}
              onSave={handleReferralRewardSave}
            />
            <ReferralRewardRow
              label="Driver → Passenger"
              settingKey="referral_driver_to_passenger_reward"
              value={Number(settings.referral_driver_to_passenger_reward?.value ?? 0)}
              saving={saving === "referral_driver_to_passenger_reward"}
              onSave={handleReferralRewardSave}
            />
            <ReferralRewardRow
              label="Driver → Driver"
              settingKey="referral_driver_to_driver_reward"
              value={Number(settings.referral_driver_to_driver_reward?.value ?? 0)}
              saving={saving === "referral_driver_to_driver_reward"}
              onSave={handleReferralRewardSave}
            />
          </div>
          <Button
            size="sm"
            variant={referralEnabled ? "outline" : "primary"}
            className="mt-4 w-full"
            disabled={saving === "referral_enabled"}
            onClick={handleToggleReferrals}
          >
            {referralEnabled ? "Disable referrals" : "Enable referrals"}
          </Button>
        </Card>

        <Card accent="violet">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <p className="text-sm text-ink-soft">
            Push/SMS template management. Reserved for a later phase — no notification_templates table exists yet.
          </p>
          <Button size="sm" variant="outline" className="mt-4" disabled title="Reserved for a later phase">
            Manage templates
          </Button>
        </Card>

        <Card accent="blue">
          <CardHeader>
            <CardTitle>App versions</CardTitle>
          </CardHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-soft">Passenger app (min. version)</span>
              <span className="font-meter text-ink">{String(settings.passenger_app_min_version?.value ?? "—")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">Driver app (min. version)</span>
              <span className="font-meter text-ink">{String(settings.driver_app_min_version?.value ?? "—")}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Languages</CardTitle>
          </CardHeader>
          <p className="text-sm text-ink-soft">
            Supported: {languages.join(", ").toUpperCase()}. Full multi-language support is a later-phase item.
          </p>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmMaintenanceOpen}
        onOpenChange={setConfirmMaintenanceOpen}
        title="Turn on maintenance mode?"
        description="This blocks new bookings platform-wide across the Passenger and Driver apps until you turn it off again."
        confirmLabel="Turn on maintenance mode"
        tone="destructive"
        loading={saving === "maintenance_mode"}
        onConfirm={handleToggleMaintenance}
      />
    </div>
  );
}

function ReferralRewardRow({
  label,
  settingKey,
  value,
  saving,
  onSave,
}: {
  label: string;
  settingKey: string;
  value: number;
  saving: boolean;
  onSave: (key: string, amount: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [amount, setAmount] = React.useState(String(value));

  React.useEffect(() => {
    if (!editing) setAmount(String(value));
  }, [value, editing]);

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink">{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <span className="text-ink-soft">₹</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-8 w-20 rounded border border-border px-2 text-xs"
            inputMode="decimal"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={saving || Number.isNaN(Number(amount)) || Number(amount) < 0}
            onClick={() => {
              onSave(settingKey, Number(amount));
              setEditing(false);
            }}
          >
            Save
          </Button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="font-meter text-ink-soft hover:text-signal-blue">
          ₹{value}
        </button>
      )}
    </div>
  );
}

/** A value is a valid fare input if it's a finite, non-negative number — rejects NaN, Infinity, negative, and malformed strings (Phase 9). */
function isValidFareValue(raw: string): boolean {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isFinite(n) && n >= 0;
}

// Absolute hard ceiling — mirrors pricing_rules_surge_multiplier_valid's
// own DB-level CHECK constraint exactly, so the client rejects an invalid
// value before ever attempting the write (server remains the real
// enforcement either way).
const SURGE_HARD_MAX = 5;

/** A surge multiplier is valid if it's finite, >= 1.00 (never a discount, never zero/negative), and within the absolute hard ceiling. */
function isValidSurgeMultiplier(raw: string): boolean {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isFinite(n) && n >= 1 && n <= SURGE_HARD_MAX;
}

function SurgeMultiplierRow({
  vehicleType,
  rule,
  maxMultiplier,
  recommendation,
  saving,
  onSave,
  onApplyRecommendation,
}: {
  vehicleType: keyof typeof VEHICLE_TYPE_LABELS_DB;
  rule: PricingRuleRow | undefined;
  maxMultiplier: number;
  recommendation: SurgeRecommendationRow | undefined;
  saving: boolean;
  onSave: (rule: PricingRuleRow, multiplier: number) => void;
  onApplyRecommendation: (rule: PricingRuleRow, suggested: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(String(rule?.surge_multiplier ?? 1));

  const valid = isValidSurgeMultiplier(value) && Number(value) <= maxMultiplier;

  if (!rule) {
    // No pricing rule at all for this vehicle yet — surge has nothing to
    // multiply. Configure base pricing above first.
    return (
      <div className="flex items-center justify-between text-sm text-ink-soft">
        <span>{VEHICLE_TYPE_LABELS_DB[vehicleType]}</span>
        <span className="text-xs italic">Set base pricing first</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 border-b border-border/60 pb-2.5 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink">{VEHICLE_TYPE_LABELS_DB[vehicleType]}</span>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              className="h-8 w-16 rounded border border-border px-2 text-xs"
            />
            <span className="text-ink-soft">x</span>
            <Button
              size="sm"
              variant="outline"
              disabled={saving || !valid}
              onClick={() => {
                onSave(rule, Number(value));
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="font-meter text-ink-soft hover:text-signal-blue">
            {rule.surge_multiplier}x
          </button>
        )}
      </div>
      {editing && !valid && (
        <p className="text-xs text-alert-red">Must be between 1.00x and {Math.min(maxMultiplier, SURGE_HARD_MAX)}x.</p>
      )}
      {!editing && recommendation && recommendation.suggested_multiplier > 1 && (
        <div className="flex items-center justify-between rounded bg-tint-marigold/40 px-2 py-1.5 text-xs">
          <span className="text-marigold-text">{recommendation.recommendation}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => onApplyRecommendation(rule, Math.min(recommendation.suggested_multiplier, maxMultiplier))}
          >
            Apply {Math.min(recommendation.suggested_multiplier, maxMultiplier)}x
          </Button>
        </div>
      )}
    </div>
  );
}

function MaxMultiplierEditor({
  value,
  saving,
  onSave,
}: {
  value: number;
  saving: boolean;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [input, setInput] = React.useState(String(value));
  const valid = isValidSurgeMultiplier(input);

  return editing ? (
    <div className="flex items-center gap-2">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        inputMode="decimal"
        className="h-8 w-16 rounded border border-border px-2 text-xs"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={saving || !valid}
        onClick={() => {
          onSave(Number(input));
          setEditing(false);
        }}
      >
        Save
      </Button>
    </div>
  ) : (
    <button onClick={() => setEditing(true)} className="font-meter text-ink hover:text-signal-blue">
      {value}x
    </button>
  );
}

/** Renders/edits the two nullable app_settings timestamps as <input type="datetime-local">. Empty = no schedule (manual on/off only). */
function SurgeWindowEditor({
  startsAt,
  endsAt,
  savingKey,
  onSave,
}: {
  startsAt: string | null;
  endsAt: string | null;
  savingKey: string | null;
  onSave: (key: "surge_starts_at" | "surge_ends_at", value: string) => void;
}) {
  function toLocalInputValue(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-ink-soft">Start (optional)</span>
        <input
          type="datetime-local"
          defaultValue={toLocalInputValue(startsAt)}
          disabled={savingKey === "surge_starts_at"}
          onBlur={(e) => onSave("surge_starts_at", e.target.value)}
          className="h-8 rounded border border-border px-2 text-xs"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-ink-soft">End (optional)</span>
        <input
          type="datetime-local"
          defaultValue={toLocalInputValue(endsAt)}
          disabled={savingKey === "surge_ends_at"}
          onBlur={(e) => onSave("surge_ends_at", e.target.value)}
          className="h-8 rounded border border-border px-2 text-xs"
        />
      </div>
      <p className="text-xs text-ink-soft">
        Leave both blank for manual on/off only. If set, surge automatically stops applying to new rides the moment
        the end time passes — no action needed.
      </p>
    </div>
  );
}

function PricingRow({
  vehicleType,
  rule,
  saving,
  onSave,
  onToggleActive,
  onCreate,
}: {
  vehicleType: keyof typeof VEHICLE_TYPE_LABELS_DB;
  rule: PricingRuleRow | undefined;
  saving: boolean;
  onSave: (rule: PricingRuleRow, baseFare: number, perKmRate: number) => void;
  onToggleActive: (rule: PricingRuleRow) => void;
  onCreate: (vehicleType: PricingRuleRow["vehicle_type"], baseFare: number, perKmRate: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [baseFare, setBaseFare] = React.useState(String(rule?.base_fare ?? ""));
  const [perKmRate, setPerKmRate] = React.useState(String(rule?.per_km_rate ?? ""));

  const valid = isValidFareValue(baseFare) && isValidFareValue(perKmRate);
  const status: "active" | "inactive" | "missing" = !rule ? "missing" : rule.is_active ? "active" : "inactive";
  const statusTone = status === "active" ? "online" : status === "inactive" ? "pending" : "alert";
  const statusLabel = status === "active" ? "ACTIVE" : status === "inactive" ? "INACTIVE" : "MISSING CONFIGURATION";

  function handleSaveClick() {
    if (!valid) return;
    if (rule) {
      onSave(rule, Number(baseFare), Number(perKmRate));
    } else {
      onCreate(vehicleType, Number(baseFare), Number(perKmRate));
    }
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-1.5 border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{VEHICLE_TYPE_LABELS_DB[vehicleType]}</span>
        <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
      </div>
      <div className="flex items-center justify-between text-sm">
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={baseFare}
              onChange={(e) => setBaseFare(e.target.value)}
              placeholder="Base fare"
              inputMode="decimal"
              className="h-8 w-20 rounded border border-border px-2 text-xs"
            />
            <span className="text-ink-soft">base +</span>
            <input
              value={perKmRate}
              onChange={(e) => setPerKmRate(e.target.value)}
              placeholder="Per km"
              inputMode="decimal"
              className="h-8 w-20 rounded border border-border px-2 text-xs"
            />
            <span className="text-ink-soft">/km</span>
            <Button size="sm" variant="outline" disabled={saving || !valid} onClick={handleSaveClick}>
              Save
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : rule ? (
          <button onClick={() => setEditing(true)} className="font-meter text-ink-soft hover:text-signal-blue">
            ₹{rule.base_fare} base + ₹{rule.per_km_rate}/km
          </button>
        ) : (
          <button onClick={() => setEditing(true)} className="text-xs font-medium text-alert-red hover:underline">
            No pricing set — click to configure
          </button>
        )}
        {rule && !editing && (
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => onToggleActive(rule)}>
            {rule.is_active ? "Deactivate" : "Activate"}
          </Button>
        )}
      </div>
      {!valid && editing && (
        <p className="text-xs text-alert-red">Enter a valid non-negative number for both fields.</p>
      )}
    </div>
  );
}
