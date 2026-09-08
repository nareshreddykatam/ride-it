import { Card } from "@ride-it/ui";

const EFFECTIVE_DATE = "September 8, 2026";
const LAST_UPDATED = "September 8, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <p className="font-meter text-xs font-medium uppercase tracking-wide text-signal-blue">
        Legal
      </p>
      <h1 className="mt-2 font-display text-4xl font-medium text-ink">Privacy Policy</h1>
      <p className="mt-3 text-sm text-ink-soft">
        Effective date: {EFFECTIVE_DATE} · Last updated: {LAST_UPDATED}
      </p>

      <Card tone="outline" className="mt-8 p-6 sm:p-8">
        <p className="text-sm leading-relaxed text-ink-soft">
          This Privacy Policy explains what information Ridora collects across the passenger app
          (
          <a href="https://app.ridora.in" className="text-signal-blue hover:underline">
            app.ridora.in
          </a>
          ), the driver app (
          <a href="https://driver.ridora.in" className="text-signal-blue hover:underline">
            driver.ridora.in
          </a>
          ), and ridora.in, and how it is used.
        </p>

        <Section title="1. Information we collect">
          <p>
            <span className="font-medium text-ink">Account information</span> — your name, email
            address, and/or mobile number, used to sign you in and identify your account.
          </p>
          <p>
            <span className="font-medium text-ink">Location data</span> — pickup and drop
            locations you enter, and, for drivers, live location while online, used to match rides
            and show a driver&apos;s position during an active trip.
          </p>
          <p>
            <span className="font-medium text-ink">Driver verification (KYC) documents</span> —
            Aadhaar, driving license, vehicle registration certificate (RC), vehicle insurance,
            and a verification selfie, collected from drivers during onboarding to confirm
            eligibility to accept rides.
          </p>
          <p>
            <span className="font-medium text-ink">Ride and payment information</span> — ride
            history, fares, ratings, and payment method/status. Online payments are processed by
            a third-party payment gateway; Ridora does not store your card or UPI credentials.
          </p>
          <p>
            <span className="font-medium text-ink">Device and notification data</span> — a device
            token used to deliver push notifications about ride status, if you enable them.
          </p>
        </Section>

        <Section title="2. How we use this information">
          <p>
            To operate the Platform: matching passengers with drivers, calculating fares,
            processing payments, verifying driver eligibility, sending ride-status notifications,
            and providing customer support. We do not sell your personal information.
          </p>
        </Section>

        <Section title="3. Sharing">
          <p>
            A matched driver and passenger can see the limited contact and ride details needed to
            complete a trip (e.g. name, vehicle, live location during that ride). Driver
            verification documents are visible only to Ridora&apos;s verification process. Payment
            processing is handled by our payment gateway partner under its own terms. If you use
            Ridora&apos;s ride-sharing feature to share your trip with a trusted contact, that
            contact can view limited, time-boxed trip status through a private link you create.
          </p>
        </Section>

        <Section title="4. Data retention and deletion">
          <p>
            We retain account, ride, and verification information for as long as your account is
            active and as needed to operate the Platform, resolve disputes, and meet legitimate
            business needs. You can request deletion of your account and associated personal data
            through in-app Support or the{" "}
            <a href="/contact" className="text-signal-blue hover:underline">
              Contact page
            </a>
            .
          </p>
        </Section>

        <Section title="5. Your choices">
          <p>
            You can review and update your profile information in the app, and disable push
            notifications at any time from your device settings. Location access can be limited
            through your device, though this may prevent the Platform from functioning correctly
            while a ride is in progress.
          </p>
        </Section>

        <Section title="6. Changes to this policy">
          <p>
            We may update this Privacy Policy as the Platform evolves. The &quot;Last
            updated&quot; date above reflects the most recent revision.
          </p>
        </Section>

        <Section title="7. Contact">
          <p>
            Questions about this Privacy Policy can be sent through the{" "}
            <a href="/contact" className="text-signal-blue hover:underline">
              Contact page
            </a>
            , or via in-app Support.
          </p>
        </Section>
      </Card>
    </main>
  );
}
