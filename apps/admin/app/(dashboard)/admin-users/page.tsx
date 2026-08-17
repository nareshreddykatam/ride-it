"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Card, CardHeader, CardTitle, Select, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  listAdminRoles,
  listAdminPermissions,
  listRolePermissionMap,
  listAdminUsers,
  getCurrentAdminInfo,
  updateAdminUserRole,
  type AdminRoleRow,
  type AdminPermissionRow,
  type AdminUserRow,
} from "@ride-it/data";

export default function AdminUsersPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [roles, setRoles] = React.useState<AdminRoleRow[]>([]);
  const [permissions, setPermissions] = React.useState<AdminPermissionRow[]>([]);
  const [rolePermissions, setRolePermissions] = React.useState<Record<string, string[]>>({});
  const [admins, setAdmins] = React.useState<AdminUserRow[]>([]);
  const [currentAdmin, setCurrentAdmin] = React.useState<AdminUserRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!user) return;
    const [r, p, rp, a, me] = await Promise.all([
      listAdminRoles(supabase),
      listAdminPermissions(supabase),
      listRolePermissionMap(supabase),
      listAdminUsers(supabase),
      getCurrentAdminInfo(supabase, user.id),
    ]);
    setRoles(r);
    setPermissions(p);
    setRolePermissions(rp);
    setAdmins(a);
    setCurrentAdmin(me);
  }, [supabase, user]);

  React.useEffect(() => {
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load RBAC data."))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function handleRoleChange(adminUserId: string, newRoleId: string) {
    // Enforced server-side by admin_users_write_super_admin RLS — a
    // non-super-admin session's UPDATE simply won't match any rows. This
    // client check only avoids showing a confusing no-op control; it is
    // not the security boundary.
    if (!currentAdmin?.is_super_admin) return;
    try {
      await updateAdminUserRole(supabase, adminUserId, newRoleId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update role — only super admins can reassign roles.");
    }
  }

  const permissionByCode = new Map(permissions.map((p) => [p.id, p.code]));

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ink">Admin users &amp; roles</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Real RBAC data — roles and permissions are managed by super admins only.
        {currentAdmin && !currentAdmin.is_super_admin && " You're viewing as a non-super-admin, so role reassignment is read-only for you."}
      </p>

      {error && <p className="mt-3 text-sm text-alert-red">{error}</p>}

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {roles.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="text-sm">{r.name.replace(/_/g, " ")}</CardTitle>
              </CardHeader>
              {r.description && <p className="text-xs text-ink-soft">{r.description}</p>}
              <p className="mt-3 text-xs font-medium text-meter-green">Can</p>
              <ul className="mt-1 space-y-1 text-xs text-ink-soft">
                {(() => {
                  const perms = rolePermissions[r.id] ?? [];
                  return perms.length === 0 ? (
                    <li>No permissions assigned</li>
                  ) : (
                    perms.map((code) => (
                      <li key={code} className="flex items-center gap-1.5">
                        <Check size={12} className="shrink-0 text-meter-green" aria-hidden="true" />
                        {code}
                      </li>
                    ))
                  );
                })()}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Admin accounts</CardTitle>
        </CardHeader>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {admins.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="text-ink">{a.full_name ?? a.email ?? "Unnamed admin"}</p>
                  <p className="text-xs text-ink-soft">{a.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {a.is_super_admin && <StatusPill tone="alert">Super admin</StatusPill>}
                  {currentAdmin?.is_super_admin && !a.is_super_admin ? (
                    <Select
                      size="sm"
                      className="w-40"
                      aria-label={`Role for ${a.full_name ?? a.email ?? "admin"}`}
                      value={a.admin_role_id}
                      onChange={(e) => handleRoleChange(a.id, e.target.value)}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name.replace(/_/g, " ")}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <StatusPill tone="info">{a.role_name?.replace(/_/g, " ") ?? "—"}</StatusPill>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-ink-soft">
          New admin accounts are provisioned out-of-band via <code>provision_admin_user()</code> (service-role only) —
          there is intentionally no self-service admin creation in this UI. See PHASE_6_2_SECURITY_AND_RUNTIME_REVIEW.md.
        </p>
      </Card>
    </div>
  );
}
