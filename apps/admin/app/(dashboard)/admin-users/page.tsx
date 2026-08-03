import { Card, CardHeader, CardTitle, StatusPill } from "@ride-it/ui";

const ROLES = [
  {
    role: "Support Admin",
    permissions: ["View drivers & passengers", "Respond to complaints", "View ride details"],
    restricted: ["Cannot edit pricing", "Cannot approve/reject payouts", "Cannot suspend accounts"],
  },
  {
    role: "Finance Admin",
    permissions: ["View & edit subscription pricing", "View payment reports", "Issue refunds"],
    restricted: ["Cannot approve/reject driver documents", "Cannot suspend accounts"],
  },
  {
    role: "Operations Admin",
    permissions: ["Approve/reject driver documents", "Suspend drivers & passengers", "Reassign/cancel live rides", "Toggle maintenance mode"],
    restricted: ["Cannot edit subscription pricing"],
  },
];

const ADMINS = [
  { name: "Divya M.", email: "divya@rideit.com", role: "Operations Admin" },
  { name: "Kiran R.", email: "kiran@rideit.com", role: "Finance Admin" },
  { name: "Neha T.", email: "neha@rideit.com", role: "Support Admin" },
];

export default function AdminUsersPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ink">Admin users &amp; roles</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Permission boundaries proposed to resolve the open RBAC gap from the
        Admin PRD — confirm before treating this as final.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r.role}>
            <CardHeader>
              <CardTitle className="text-sm">{r.role}</CardTitle>
            </CardHeader>
            <p className="text-xs font-medium text-meter-green">Can</p>
            <ul className="mt-1 space-y-1 text-xs text-ink-soft">
              {r.permissions.map((p) => <li key={p}>• {p}</li>)}
            </ul>
            <p className="mt-3 text-xs font-medium text-alert-red">Cannot</p>
            <ul className="mt-1 space-y-1 text-xs text-ink-soft">
              {r.restricted.map((p) => <li key={p}>• {p}</li>)}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Admin accounts</CardTitle>
        </CardHeader>
        <div className="flex flex-col divide-y divide-border">
          {ADMINS.map((a) => (
            <div key={a.email} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="text-ink">{a.name}</p>
                <p className="text-xs text-ink-soft">{a.email}</p>
              </div>
              <StatusPill tone="info">{a.role}</StatusPill>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
