"use client";

import * as React from "react";
import { MapPin, Home, Briefcase, Users, GraduationCap, Trash2, Plus, Pencil } from "lucide-react";
import { BottomSheet, Button, Card, EmptyState, SkeletonRow } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  listSavedPlaces,
  createSavedPlace,
  updateSavedPlace,
  deleteSavedPlace,
  type SavedPlaceRow,
} from "@ride-it/data";

const ICONS: Record<string, typeof MapPin> = {
  home: Home,
  office: Briefcase,
  work: Briefcase,
  friends: Users,
  college: GraduationCap,
  other: MapPin,
};

// Part 2 default presets — offered as one-tap quick-adds for any preset the
// passenger hasn't already saved; picking one still opens the same
// address-entry sheet as "Add" (real geocoding is out of scope this
// phase — see the address input below), just pre-labelled and pre-iconed.
const PRESETS: { label: string; icon: string }[] = [
  { label: "Home", icon: "home" },
  { label: "Office", icon: "office" },
  { label: "Friends", icon: "friends" },
  { label: "College", icon: "college" },
];

// Demo coordinates for newly-added places — real geocoding/map picking is
// out of scope this phase (maps are explicitly excluded), same boundary as
// the existing Search screen's mock suggestions. Vijayawada (operating city).
const DEMO_COORDS = { lat: 16.5062, lng: 80.648 };

export default function SavedPlacesPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [places, setPlaces] = React.useState<SavedPlaceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [label, setLabel] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [icon, setIcon] = React.useState("other");
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!user) return;
    const rows = await listSavedPlaces(supabase, user.id);
    setPlaces(rows);
  }, [supabase, user]);

  React.useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  function openAdd(preset?: { label: string; icon: string }) {
    setEditingId(null);
    setLabel(preset?.label ?? "");
    setIcon(preset?.icon ?? "other");
    setAddress("");
    setSheetOpen(true);
  }

  function openEdit(place: SavedPlaceRow) {
    setEditingId(place.id);
    setLabel(place.label);
    setAddress(place.address);
    setIcon(place.icon ?? "other");
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!user || !label.trim() || !address.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateSavedPlace(supabase, editingId, { label: label.trim(), address: address.trim(), icon });
      } else {
        await createSavedPlace(supabase, {
          passengerId: user.id,
          label: label.trim(),
          address: address.trim(),
          location: DEMO_COORDS,
          icon,
        });
      }
      setSheetOpen(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    await deleteSavedPlace(supabase, id);
  }

  const savedLabels = new Set(places.map((p) => p.label.toLowerCase()));
  const availablePresets = PRESETS.filter((p) => !savedLabels.has(p.label.toLowerCase()));

  return (
    <main className="flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium text-ink">Saved places</h1>
        <Button size="sm" variant="outline" onClick={() => openAdd()}>
          <Plus size={15} /> Add
        </Button>
      </div>

      {!loading && availablePresets.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {availablePresets.map((preset) => {
            const Icon = ICONS[preset.icon] ?? MapPin;
            return (
              <button
                key={preset.label}
                onClick={() => openAdd(preset)}
                className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-ink-soft hover:border-signal-blue hover:text-signal-blue"
              >
                <Icon size={13} /> {preset.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {loading && Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)}

        {!loading && places.length === 0 && (
          <EmptyState
            icon={<MapPin size={20} />}
            title="No saved places yet"
            description="Add Home, Office, or anywhere else you go often for faster booking."
            action={
              <Button size="sm" onClick={() => openAdd()}>
                Add a place
              </Button>
            }
          />
        )}

        {!loading &&
          places.map((place) => {
            const Icon = ICONS[place.icon ?? "other"] ?? MapPin;
            return (
              <Card key={place.id} className="flex items-center justify-between">
                <button className="flex flex-1 items-center gap-3 text-left" onClick={() => openEdit(place)}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal-blue/10 text-signal-blue">
                    <Icon size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">{place.label}</p>
                    <p className="text-xs text-ink-soft">{place.address}</p>
                  </div>
                </button>
                <div className="flex items-center">
                  <button onClick={() => openEdit(place)} aria-label={`Edit ${place.label}`} className="p-2.5 text-ink-soft hover:text-signal-blue">
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(place.id)}
                    aria-label={`Remove ${place.label}`}
                    className="p-2.5 text-ink-soft hover:text-alert-red"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </Card>
            );
          })}
      </div>

      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <p className="font-display text-lg font-medium text-ink">{editingId ? "Edit place" : "Add a place"}</p>
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home, Office, Gym…"
              className="h-12 w-full rounded-lg border border-border bg-white px-4 text-sm text-ink outline-none focus:border-signal-blue"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Search or enter address"
              className="h-12 w-full rounded-lg border border-border bg-white px-4 text-sm text-ink outline-none focus:border-signal-blue"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Icon</label>
            <div className="flex gap-2">
              {(["home", "office", "friends", "college", "other"] as const).map((key) => {
                const Icon = ICONS[key] ?? MapPin;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                      icon === key ? "border-2 border-signal-blue text-signal-blue" : "border-border text-ink-soft"
                    }`}
                    aria-label={key}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <Button
          className="mt-6 w-full"
          disabled={!label.trim() || !address.trim() || saving}
          onClick={handleSave}
        >
          {saving ? "Saving…" : editingId ? "Save changes" : "Save place"}
        </Button>
      </BottomSheet>
    </main>
  );
}
