"use client";

/**
 * The ONE client-safe file in @ride-it/payments — imported from
 * "@ride-it/payments/client-checkout", never from the package's main
 * barrel (which is entirely server-only and would be wrong to import
 * from a "use client" component). This file never touches a secret key;
 * it only ever receives the publishable key_id and a gateway order_id,
 * both already safe to expose to the browser by design (Razorpay's own
 * Checkout.js requires the key_id client-side to render the widget at
 * all — this is the standard, intended usage of that specific key).
 */

export interface RazorpayCheckoutOptions {
  keyId: string;
  orderId: string;
  amountInSmallestUnit: number;
  currency: string;
  name: string;
  description: string;
  prefillContact?: string;
  onSuccess: (result: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  onDismiss: () => void;
}

let scriptLoadPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Checkout can only be opened in the browser"));
  if ((window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve();

  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load the payment checkout script"));
      document.body.appendChild(script);
    });
  }
  return scriptLoadPromise;
}

/**
 * Opens Razorpay's own checkout widget. This function does not verify
 * anything and does not talk to Ridora's backend — it only collects
 * payment details and hands back what the gateway returned, which the
 * caller must then send to a Route Handler (e.g. /api/payments/verify)
 * for real server-side signature verification. Never treat onSuccess
 * firing as "payment confirmed" on its own.
 */
export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<void> {
  await loadCheckoutScript();

  const RazorpayCtor = (window as unknown as { Razorpay: new (opts: unknown) => { open: () => void } }).Razorpay;

  const instance = new RazorpayCtor({
    key: options.keyId,
    order_id: options.orderId,
    amount: options.amountInSmallestUnit,
    currency: options.currency,
    name: options.name,
    description: options.description,
    prefill: options.prefillContact ? { contact: options.prefillContact } : undefined,
    handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
      options.onSuccess(response);
    },
    modal: {
      ondismiss: () => options.onDismiss(),
    },
  });

  instance.open();
}
