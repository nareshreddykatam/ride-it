import { Card } from "@ride-it/ui";

// Real implementation date of this rewrite (see repo history) — not a
// placeholder. Update both dates together if this page's substance changes
// again; leave Effective Date alone for a purely typographical fix.
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

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <p className="font-meter text-xs font-medium uppercase tracking-wide text-signal-blue">
        Legal
      </p>
      <h1 className="mt-2 font-display text-4xl font-medium text-ink">Terms of Service</h1>
      <p className="mt-3 text-sm text-ink-soft">
        Effective date: {EFFECTIVE_DATE} · Last updated: {LAST_UPDATED}
      </p>

      <Card tone="outline" className="mt-8 p-6 sm:p-8">
        <p className="text-sm leading-relaxed text-ink-soft">
          These Terms of Service (&quot;Terms&quot;) govern your use of Ridora — the passenger app
          at{" "}
          <a href="https://app.ridora.in" className="text-signal-blue hover:underline">
            app.ridora.in
          </a>
          , the driver app at{" "}
          <a href="https://driver.ridora.in" className="text-signal-blue hover:underline">
            driver.ridora.in
          </a>
          , and the ridora.in website (together, the &quot;Platform&quot;). By creating an
          account or using the Platform, you agree to these Terms. If you do not agree, do not
          use the Platform.
        </p>

        <Section title="1. What Ridora is">
          <p>
            Ridora is a technology platform that connects passengers who want a ride with
            independent drivers who provide transportation services using their own vehicles.
            Ridora is not a transportation carrier — drivers are not Ridora employees, and rides
            are performed by the driver, not by Ridora.
          </p>
        </Section>

        <Section title="2. Accounts and authentication">
          <p>
            You sign in using a one-time code (OTP) sent to your email or mobile number. You are
            responsible for keeping access to that email or mobile number secure, and for all
            activity on your account. A single Ridora identity can hold both a passenger and a
            driver profile; each role is used strictly according to its own verification and
            eligibility requirements below.
          </p>
        </Section>

        <Section title="3. Booking a ride">
          <p>
            As a passenger, you request a ride by entering a pickup and drop location and
            choosing a vehicle type (Bike, Scooty, Auto, or Car, subject to availability in your
            city). The Platform matches your request with a nearby available driver. You confirm
            ride start and end with your driver using the OTP shown in your app.
          </p>
        </Section>

        <Section title="4. Driver verification and eligibility">
          <p>
            Drivers must register and be verified before they can accept rides, including a valid
            driving license, vehicle registration certificate (RC), vehicle insurance, Aadhaar,
            and a selfie for identity verification. Ridora reviews this documentation before
            approving a driver to go online; approval reflects that the required documents were
            submitted and reviewed, not a guarantee of a driver&apos;s conduct or driving record.
          </p>
          <p>
            Drivers access the Platform under a flat-fee subscription (Daily, Weekly, Monthly, or
            Yearly) rather than a per-ride commission. A driver must hold an active subscription
            and an approved verification status to go online and accept rides.
          </p>
        </Section>

        <Section title="5. Fares and payment">
          <p>
            The fare shown before you confirm a ride is an estimate based on the selected vehicle
            type, distance, and current pricing (which may include a surge multiplier at
            high-demand times). The final fare is calculated by Ridora at the end of the ride from
            the trip actually completed, and may differ from the initial estimate if the actual
            route or duration differs from the estimate.
          </p>
          <p>
            You can pay by cash, by scanning your driver&apos;s UPI QR code directly, or via
            online payment through the Platform&apos;s payment gateway, where available. Ridora
            does not take a commission on ride fares; cash and UPI-to-driver payments go directly
            to the driver.
          </p>
        </Section>

        <Section title="6. Cancellations">
          <p>
            Passengers and drivers may cancel a ride before it starts. Cancelling after a driver
            has already been matched or has started travelling to pickup affects that driver
            directly, and repeated or last-minute cancellations may affect your ability to be
            matched or to use the Platform. Ridora does not currently guarantee a monetary
            cancellation fee or refund in either direction beyond what is stated at the time of
            cancellation in the app.
          </p>
        </Section>

        <Section title="7. User responsibilities and conduct">
          <p>
            You agree to provide accurate information, to treat drivers and passengers
            respectfully, to use the Platform only for lawful purposes, and — for drivers — to
            hold a valid driving license and any permits your vehicle and city require, and to
            keep your vehicle documents current. Ridora may suspend or terminate access to the
            Platform for a violation of these Terms, fraudulent activity, or conduct that
            compromises the safety of other users.
          </p>
        </Section>

        <Section title="8. Safety">
          <p>
            Ridora includes safety features such as OTP-verified ride start, two-way ratings after
            every ride, and in-app emergency (SOS) access during a ride. These features are aids,
            not a guarantee of safety on any individual trip. Ridora does not currently hold
            transportation-specific regulatory licenses, permits, or insurance coverage beyond
            what individual drivers are independently required to carry for their own vehicles —
            Ridora does not represent otherwise, and you should not rely on the Platform as a
            substitute for your own judgment about a specific ride.
          </p>
        </Section>

        <Section title="9. Privacy">
          <p>
            Ridora collects and uses information (including location data and driver verification
            documents) as described in our{" "}
            <a href="/legal/privacy" className="text-signal-blue hover:underline">
              Privacy Policy
            </a>
            , which forms part of these Terms.
          </p>
        </Section>

        <Section title="10. Platform rights and limitations">
          <p>
            Ridora may modify, suspend, or discontinue any part of the Platform, including
            available cities, vehicle types, pricing, or subscription plans, at any time. Ridora
            is provided on an &quot;as is&quot; basis without warranties of uninterrupted or
            error-free operation. To the extent permitted by law, Ridora&apos;s liability for
            issues arising from use of the Platform is limited; nothing in these Terms limits
            liability that cannot be limited under applicable law.
          </p>
        </Section>

        <Section title="11. Changes to these Terms">
          <p>
            Ridora may update these Terms as the Platform evolves. The &quot;Last updated&quot;
            date above reflects the most recent revision. Continuing to use the Platform after an
            update means you accept the revised Terms.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            Questions about these Terms can be sent through the{" "}
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
