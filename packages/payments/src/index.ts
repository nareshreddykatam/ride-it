export * from "./types";
export * from "./env";

import { razorpayProvider } from "./providers/razorpay";
import type { PaymentProvider } from "./types";

/**
 * The one place in this entire package (and the entire codebase) that
 * names a specific gateway. Every Route Handler imports getPaymentProvider()
 * — never `providers/razorpay` directly — so switching providers later is
 * a one-line change here, not a rewrite of the payment domain.
 */
export function getPaymentProvider(): PaymentProvider {
  return razorpayProvider;
}
