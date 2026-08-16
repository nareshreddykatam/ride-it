"use client";

import * as React from "react";
import { MapPin, Home, Briefcase, Trash2, Plus } from "lucide-react";
import { BottomSheet, Button, Card, EmptyState, SkeletonRow } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listSavedPlaces, createSavedPlace, deleteSavedPlace, type SavedPlaceRow } from "@ride-it/data";

const ICONS: Record<string, typeof MapPin> = { home: Home, work: Briefcase, other: MapPin };

// Demo coordinates for newly-added places — real geocoding/map picking is
// out of scope this phase (maps are explicitly excluded), same boundary as
// the existing Search screen's mock suggestions.
const DEMO_COORDS = { lat: 17.385, lng: 78.4867 };

export default function SavedPlacesPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [places, setPlaces] = React.useState<SavedPlaceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!user) return;
    const rows = await listSavedPlaces(supabase, user.id);
    setPlaces(rows);
  }, [supabase, user]);

  React.useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function handleAdd() {
    if (!user || !label.trim() || !address.trim()) return;
    setSaving(true);
    try {
      await createSavedPlace(supabase, {
        passengerId: user.id,
        label: label.trim(),
        address: address.trim(),
        location: DEMO_COORDS,
        icon: "other",
      });
      setLabel("");
      setAddress("");
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

  return (
    <main className="flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium text-ink">Saved places</h1>
        <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
          <Plus size={15} /> Add
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {loading && Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)}

        {!loading && places.length === 0 && (
          <EmptyState
            icon={<MapPin size={20} />}
            title="No saved places yet"
            description="Add Home, Work, or anywhere else you go often for faster booking."
            action={
              <Button size="sm" onClick={() => setSheetOpen(true)}>
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
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal-blue/10 text-signal-blue">
                    <Icon size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">{place.label}</p>
                    <p className="text-xs text-ink-soft">{place.address}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(place.id)}
                  aria-label={`Remove ${place.label}`}
                  className="text-ink-soft hover:text-alert-red"
                >
                  <Trash2 size={16} />
                </button>
              </Card>
            );
          })}
      </div>

      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <p className="font-display text-lg font-medium text-ink">Add a place</p>
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home, Work, Gym…"
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
        </div>
        <Button
          className="mt-6 w-full"
          disabled={!label.trim() || !address.trim() || saving}
          onClick={handleAdd}
        >
          {saving ? "Saving…" : "Save place"}
        </Button>
      </BottomSheet>
    </main>
  );
}
