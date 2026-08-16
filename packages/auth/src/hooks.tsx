"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./context";
import type { AppRole } from "./types";

/**
 * Redirects client-side if the signed-in user's role doesn't match. This is
 * a secondary safety net — the primary enforcement is server-side in each
 * app's middleware.ts (see ./middleware.ts), which runs before any page
 * renders. This hook mainly covers client-side navigations where
 * middleware already ran once for the initial request but auth state
 * later changes (e.g. a manual sign-out in another tab).
 */
export function useRequireRole(role: AppRole, redirectTo = "/login") {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    if (!user || !profile || profile.role !== role) {
      router.replace(redirectTo);
    }
  }, [loading, user, profile, role, redirectTo, router]);

  return { profile, loading, isAuthorized: !loading && !!profile && profile.role === role };
}

/**
 * Wrapper form of useRequireRole for layouts that just need to gate their
 * children — renders nothing until authorization is confirmed, to avoid a
 * flash of protected content before the redirect fires.
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
  if (!isAuthorized) return null;
  return <>{children}</>;
}
