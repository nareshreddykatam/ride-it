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
  type AppSettingRow,
  type PricingRuleRow,
} from "@ride-it/data";

export default function SettingsPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [settings, setSettings] = React.useState<Record<string, AppSettingRow>>({});
  const [pricing, setPricing] = React.useState<PricingRuleRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [confirmMaintenanceOpen, setConfirmMaintenanceOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [s, p] = await Promise.all([listAppSettingsAdmin(supabase), listPricingRulesAdmin(supabase)]);
    setSettings(Object.fromEntries(s.map((row) => [row.key, row])));
    setPricing(p);
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
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <p className="mb-3 text-xs text-ink-soft">Base fare + per-km. No surge pricing.</p>
          <div className="space-y-3">
            {pricing.map((rule) => (
              <PricingRow key={rule.id} rule={rule} saving={saving === rule.id} onSave={handlePricingSave} />
            ))}
          </div>
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

function PricingRow({
  rule,
  saving,
  onSave,
}: {
  rule: PricingRuleRow;
  saving: boolean;
  onSave: (rule: PricingRuleRow, baseFare: number, perKmRate: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [baseFare, setBaseFare] = React.useState(String(rule.base_fare));
  const [perKmRate, setPerKmRate] = React.useState(String(rule.per_km_rate));

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink">{VEHICLE_TYPE_LABELS_DB[rule.vehicle_type] ?? rule.vehicle_type}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input value={baseFare} onChange={(e) => setBaseFare(e.target.value)} className="h-8 w-16 rounded border border-border px-2 text-xs" />
          <span className="text-ink-soft">base +</span>
          <input value={perKmRate} onChange={(e) => setPerKmRate(e.target.value)} className="h-8 w-16 rounded border border-border px-2 text-xs" />
          <span className="text-ink-soft">/km</span>
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => {
              onSave(rule, Number(baseFare), Number(perKmRate));
              setEditing(false);
            }}
          >
            Save
          </Button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="font-meter text-ink-soft hover:text-signal-blue">
          ₹{rule.base_fare} base + ₹{rule.per_km_rate}/km
        </button>
      )}
    </div>
  );
}
