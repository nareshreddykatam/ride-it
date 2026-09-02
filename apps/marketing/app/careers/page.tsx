import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Button, Card, EmptyState } from "@ride-it/ui";

export default function CareersPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <p className="font-meter text-xs font-medium uppercase tracking-wide text-signal-blue">
        Join us
      </p>
      <h1 className="mt-2 font-display text-4xl font-medium text-ink">Careers</h1>
      <p className="mt-3 text-ink-soft">
        We&apos;re building Ridora with a small, focused team.
      </p>

      <Card tone="elevated" className="mt-8 p-2 sm:p-4">
        <EmptyState
          className="mt-4"
          icon={<Briefcase size={20} />}
          title="No open roles right now"
          description="Check back soon, or reach out directly if you think you'd be a great fit."
          action={
            <Link href="/contact">
              <Button size="sm" variant="outline">
                Get in touch
              </Button>
            </Link>
          }
        />
      </Card>
    </main>
  );
}
