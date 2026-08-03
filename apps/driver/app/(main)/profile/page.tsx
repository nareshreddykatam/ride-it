import Link from "next/link";
import { Button, Card, StatusPill } from "@ride-it/ui";

export default function DriverProfilePage() {
  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Profile</h1>

      <Card className="mt-4">
        <p className="font-display text-lg font-medium text-ink">Ramesh K.</p>
        <p className="text-sm text-ink-soft">+91 98765 43210 · Auto</p>
        <div className="mt-2 flex items-center gap-2">
          <StatusPill tone="online">Verified</StatusPill>
          <span className="text-xs text-ink-soft">★ 4.8 rating</span>
        </div>
      </Card>

      <div className="mt-6 flex flex-col gap-2">
        <Link href="/documents">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Documents</span>
            <span className="text-xs text-ink-soft">View</span>
          </Card>
        </Link>
        <Link href="/subscription">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Subscription plan</span>
            <span className="text-xs text-ink-soft">Manage</span>
          </Card>
        </Link>
      </div>

      <Button variant="outline" className="mt-8 w-full">
        Log out
      </Button>
    </main>
  );
}
