"use client";

import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getSession as fetchSession, onAuthStateChange, signOut as supabaseSignOut } from "@ride-it/supabase/auth";
import type { AuthProfile } from "./types";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /** null while loading, or if the auth.users row has no matching public.users profile yet */
  profile: AuthProfile | null;
  /** true only during the initial session check — NOT re-set true on every auth state change */
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = React.useState<User | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<AuthProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadProfile = React.useCallback(
    async (userId: string) => {
      // Three parallel PK-lookup queries rather than an embed: passengers/
      // drivers each have several ambiguous FK relationships to users (see
      // packages/data/src/profile.ts's PROFILE_COLUMNS comment on the exact
      // PGRST201 this ran into before), so a bare embed here would be
      // fragile. Capability is read straight from row existence — the
      // same signal isPassengerProfileComplete/RequireRole ultimately act
      // on — never from users.role, which stays whatever role this
      // identity originally signed up under and is no longer the gate for
      // passenger/driver app access (see hooks.tsx's hasRoleCapability).
      const [usersResult, passengerResult, driverResult] = await Promise.all([
        supabase.from("users").select("id, role, full_name, email, phone").eq("id", userId).maybeSingle(),
        supabase.from("passengers").select("id").eq("id", userId).maybeSingle(),
        supabase.from("drivers").select("id").eq("id", userId).maybeSingle(),
      ]);

      if (usersResult.error) {
        setError(usersResult.error.message);
        setProfile(null);
        return;
      }

      // Cast the row once rather than each property individually — see
      // @ride-it/supabase/types.ts's placeholder-Database-type comment.
      // (A per-property `as` cast doesn't compile when the base type is
      // `never`, which is what the placeholder Database type produces.)
      const row = usersResult.data as unknown as {
        id: string;
        role: AuthProfile["role"];
        full_name: string | null;
        email: string | null;
        phone: string | null;
      } | null;

      setProfile(
        row
          ? {
              id: row.id,
              role: row.role,
              fullName: row.full_name,
              email: row.email,
              phone: row.phone,
              // A transient error here (network blip, etc.) fails closed to
              // "no capability" rather than throwing — the same outcome as
              // a genuinely-missing row, which just re-shows onboarding
              // rather than granting access on a guess.
              isPassenger: !!passengerResult.data,
              isDriver: !!driverResult.data,
            }
          : null
      );
    },
    [supabase]
  );

  React.useEffect(() => {
    let active = true;

    (async () => {
      try {
        const currentSession = await fetchSession(supabase);
        if (!active) return;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        if (currentSession?.user) await loadProfile(currentSession.user.id);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load session");
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unsubscribe = onAuthStateChange(supabase, (nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setError(null);
      if (nextSession?.user) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const signOut = React.useCallback(async () => {
    setError(null);
    try {
      await supabaseSignOut(supabase);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to sign out";
      setError(message);
      throw e;
    }
  }, [supabase]);

  const value = React.useMemo<AuthContextValue>(
    () => ({ user, session, profile, loading, error, signOut }),
    [user, session, profile, loading, error, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used within an <AuthProvider>");
  return ctx;
}
