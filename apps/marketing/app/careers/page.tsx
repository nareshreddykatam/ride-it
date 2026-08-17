import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Button, EmptyState } from "@ride-it/ui";

export default function CareersPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl font-medium text-ink">Careers</h1>
      <p className="mt-4 text-ink-soft">
        We&apos;re building Ride It with a small, focused team.
      </p>

      <EmptyState
        className="mt-10"
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
    </main>
  );
}
