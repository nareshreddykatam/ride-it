/**
 * The provider abstraction every gateway integration implements. Nothing
 * in the ride/subscription payment domain (the RPCs in
 * supabase/migrations/2026081609*, or the Route Handlers that call this
 * package) references Razorpay by name except providers/razorpay.ts
 * itself and the one line in index.ts that selects it — adding a second
 * compliant gateway later means writing a new file implementing this
 * interface, not touching the domain model.
 */

export interface CreateOrderParams {
  /** Smallest currency unit (paise for INR) — the provider's API expects this, not rupees. */
  amountInSmallestUnit: number;
  currency: string;
  /** Provider-side reference for reconciliation — this app always passes its own internal payment record's id. */
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResult {
  providerOrderId: string;
  amountInSmallestUnit: number;
  currency: string;
}

export interface VerifyPaymentParams {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  eventId: string;
  eventType: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  /** Normalized to this app's own vocabulary, not the provider's raw event name — see providers/razorpay.ts's mapping. */
  status: "captured" | "failed" | "cancelled" | "unknown";
}

export interface InitiateRefundParams {
  providerPaymentId: string;
  amountInSmallestUnit: number;
  reason?: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: string;
}

export interface PaymentProvider {
  readonly name: string;
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  /** Pure signature verification (HMAC), no network call — safe to run synchronously in a Route Handler before trusting a client-reported success. */
  verifyPaymentSignature(params: VerifyPaymentParams): boolean;
  /** Verifies the webhook's own signature header and normalizes the event — the Route Handler still owns deciding what to do with the result. */
  verifyAndParseWebhook(rawBody: string, signatureHeader: string): WebhookVerificationResult;
  initiateRefund(params: InitiateRefundParams): Promise<RefundResult>;
}
