"use client";

import * as React from "react";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getMyRestaurants, type OwnedRestaurant } from "@ride-it/data";
import { useAuth } from "@ride-it/auth";

interface RestaurantContextValue {
  restaurants: OwnedRestaurant[];
  current: OwnedRestaurant | null;
  setCurrentId: (id: string) => void;
  loading: boolean;
  refresh: () => void;
}

const RestaurantContext = React.createContext<RestaurantContextValue | undefined>(undefined);

/**
 * Loads every restaurant this owner has (an owner may run more than one —
 * see 20260914090100's schema comment) and tracks which one the rest of
 * the app is currently viewing. Defaults to the first; most owners will
 * only ever have one, so the selector this exposes stays invisible until
 * a second restaurant actually exists.
 */
export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [restaurants, setRestaurants] = React.useState<OwnedRestaurant[]>([]);
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(() => {
    if (!user) return;
    getMyRestaurants(supabase).then((list) => {
      setRestaurants(list);
      setCurrentId((prev) => prev ?? list[0]?.id ?? null);
      setLoading(false);
    });
  }, [supabase, user]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const current = restaurants.find((r) => r.id === currentId) ?? null;

  return (
    <RestaurantContext.Provider value={{ restaurants, current, setCurrentId, loading, refresh }}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant(): RestaurantContextValue {
  const ctx = React.useContext(RestaurantContext);
  if (!ctx) throw new Error("useRestaurant() must be used within a <RestaurantProvider>");
  return ctx;
}
