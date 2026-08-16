/**
 * @ride-it/payments is a SERVER-ONLY package in its entirety — unlike
 * @ride-it/supabase or @ride-it/maps, there is no client-safe barrel
 * here. Every export in this package touches a provider secret key or
 * wraps logic that must never run in a browser bundle. Only import this
 * package from Next.js Route Handlers (app/api/.../route.ts), never from
 * a "use client" component.
 *
 * The one genuinely client-safe value — Razorpay's publishable "key_id"
 * — is still served through a Route Handler response (see
 * apps/passenger/app/api/payments/create-order/route.ts), not exported
 * directly from here for a component to import, so there is exactly one
 * place in each app where a payments-related value crosses into the
 * browser, and it's auditable.
 */

export function getRazorpayKeyId(): string {
  const key = process.env.RAZORPAY_KEY_ID;
  if (!key) {
    throw new Error("[@ride-it/payments] Missing RAZORPAY_KEY_ID.");
  }
  return key;
}

export function getRazorpayKeySecret(): string {
  const key = process.env.RAZORPAY_KEY_SECRET;
  if (!key) {
    throw new Error("[@ride-it/payments] Missing RAZORPAY_KEY_SECRET.");
  }
  return key;
}

export function getRazorpayWebhookSecret(): string {
  const key = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!key) {
    throw new Error("[@ride-it/payments] Missing RAZORPAY_WEBHOOK_SECRET.");
  }
  return key;
}

/**
 * Whether the payment gateway is configured at all — checked before
 * offering "Ride It Online" as a selectable payment method, and before
 * any Route Handler attempts a gateway call. No credentials exist in
 * this development environment, so this returns false here — the app
 * must (and does) degrade honestly rather than crash. See
 * PHASE_11_PAYMENTS_FINANCIAL_INTEGRITY_REVIEW.md.
 */
export function isPaymentGatewayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
