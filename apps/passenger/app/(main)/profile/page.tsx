import Link from "next/link";
import { Button, Card, StatusPill } from "@ride-it/ui";

export default function PassengerProfilePage() {
  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Profile</h1>

      <Card className="mt-4">
        <p className="font-display text-lg font-medium text-ink">Priya S.</p>
        <p className="text-sm text-ink-soft">+91 98123 45670</p>
        <div className="mt-2">
          <StatusPill tone="online">★ 4.9 rating</StatusPill>
        </div>
      </Card>

      <div className="mt-6 flex flex-col gap-2">
        <Card className="flex items-center justify-between">
          <span className="text-sm text-ink">Saved addresses</span>
          <span className="text-xs text-ink-soft">Manage</span>
        </Card>
        <Card className="flex items-center justify-between">
          <span className="text-sm text-ink">Payment methods</span>
          <span className="text-xs text-ink-soft">Manage</span>
        </Card>
        <Card className="flex items-center justify-between">
          <span className="text-sm text-ink">Help &amp; support</span>
          <span className="text-xs text-ink-soft">Open</span>
        </Card>
        <Link href="/settings">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Settings</span>
            <span className="text-xs text-ink-soft">Open</span>
          </Card>
        </Link>
      </div>

      <Button variant="outline" className="mt-8 w-full">
        Log out
      </Button>
    </main>
  );
}
