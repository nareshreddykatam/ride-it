"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./context";
import type { AppRole, AuthProfile } from "./types";

/**
 * "Does this identity have the capability this app requires?" — admin
 * stays a strict role match (a privileged, non-combinable capability);
 * passenger/driver are read from row existence (profile.isPassenger/
 * isDriver), so the SAME Auth identity can hold either or both without
 * users.role (a single, original-signup-role field) ever being the gate.
 * Mirrors the exact same distinction packages/auth/src/middleware.ts's
 * createAuthMiddleware makes server-side — keep both in sync.
 */
function hasRoleCapability(profile: AuthProfile | null, role: AppRole): boolean {
  if (!profile) return false;
  if (role === "admin") return profile.role === "admin";
  if (role === "passenger") return profile.isPassenger;
  return profile.isDriver;
}

/**
 * Redirects client-side if the signed-in user lacks this app's capability.
 * This is a secondary safety net — the primary enforcement is server-side
 * in each app's middleware.ts (see ./middleware.ts), which runs before any
 * page renders and already sends a capability-less passenger/driver to
 * onboarding rather than here. This hook mainly covers client-side
 * navigations where middleware already ran once for the initial request
 * but auth state later changes (e.g. a manual sign-out in another tab).
 */
export function useRequireRole(role: AppRole, redirectTo = "/login") {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const authorized = hasRoleCapability(profile, role);

  React.useEffect(() => {
    if (loading) return;
    if (!user || !authorized) {
      router.replace(redirectTo);
    }
  }, [loading, user, authorized, redirectTo, router]);

  return { profile, loading, isAuthorized: !loading && !!user && authorized };
}

/**
 * Plain inline styles, not Tailwind classes: this package's src isn't in
 * any app's Tailwind `content` glob (only packages/ui and packages/maps
 * are), so utility classes used here would silently compile to nothing —
 * confirmed against apps/passenger/tailwind.config.ts. Inline styles work
 * regardless of which app renders this.
 */
function AuthLoadingFallback() {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "3px solid rgba(0,0,0,0.12)",
          borderTopColor: "rgba(0,0,0,0.45)",
          animation: "ride-it-auth-spin 0.8s linear infinite",
        }}
      />
      <style>{"@keyframes ride-it-auth-spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

/**
 * Wrapper form of useRequireRole for layouts that just need to gate their
 * children. Renders a plain loading spinner (not the children, not "") until
 * authorization is confirmed.
 *
 * This used to `return null` here — indistinguishable from a blank/white
 * page — for the entire window between a route mounting and the auth
 * context's session+profile fetch resolving (real, observed to take
 * several seconds after a fresh sign-in redirect, longer on a slow
 * connection). A user watching nothing happen for that long has every
 * reason to assume the app broke and reload — which "worked" only because
 * the reload landed after the async state had already settled, not
 * because anything was actually fixed. Showing a spinner during a real,
 * bounded loading window is the correct fix for that gap, not a band-aid:
 * nothing here is being hidden, since there is no error in this path,
 * only genuine in-flight async work.
 */
export function RequireRole({
  role,
  redirectTo = "/login",
  children,
}: {
  role: AppRole;
  redirectTo?: string;
  children: React.ReactNode;
}) {
  const { isAuthorized } = useRequireRole(role, redirectTo);
  if (!isAuthorized) return <AuthLoadingFallback />;
  return <>{children}</>;
}
