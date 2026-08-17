"use client";

import * as React from "react";
import { Button, Card, EmptyState, LocationIcon, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listCitiesAdmin, setCityActive, createCity, type CityRow } from "@ride-it/data";
import { MapPin } from "lucide-react";

export default function CitiesPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [cities, setCities] = React.useState<CityRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [name, setName] = React.useState("");
  const [state, setState] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setCities(await listCitiesAdmin(supabase));
  }, [supabase]);

  React.useEffect(() => {
    if (!user) return;
    refresh().finally(() => setLoading(false));
  }, [user, refresh]);

  async function handleToggle(city: CityRow) {
    await setCityActive(supabase, city.id, !city.is_active);
    await refresh();
  }

  async function handleAdd() {
    if (!name.trim()) return;
    setAdding(true);
    try {
      await createCity(supabase, { name: name.trim(), state: state.trim() || undefined });
      setName("");
      setState("");
      await refresh();
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-blue text-signal-blue">
          <LocationIcon size={20} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Cities</h1>
          <p className="text-sm text-ink-soft">
            Ride It launches city by city: Vijayawada → Hyderabad → additional cities. Activate or add cities as the
            rollout expands — this is service-area scoping only, not a driver-matching/geofencing system.
          </p>
        </div>
      </div>

      <Card className="mt-4" accent="blue">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-ink-soft">City name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vijayawada"
              className="h-9 w-48 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-signal-blue"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">State (optional)</label>
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="e.g. Andhra Pradesh"
              className="h-9 w-48 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-signal-blue"
            />
          </div>
          <Button size="sm" disabled={!name.trim() || adding} onClick={handleAdd}>
            Add city
          </Button>
        </div>
      </Card>

      <div className="mt-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : cities.length === 0 ? (
          <EmptyState icon={<MapPin size={20} />} title="No cities yet" description="Add your first launch city above." />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {cities.map((city) => (
              <Card key={city.id} accent={city.is_active ? "green" : undefined}>
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm font-medium text-ink">{city.name}</p>
                  <StatusPill tone={city.is_active ? "online" : "offline"}>{city.is_active ? "Live" : "Inactive"}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-ink-soft">{city.state ?? city.country}</p>
                <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => handleToggle(city)}>
                  {city.is_active ? "Deactivate" : "Activate"}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
