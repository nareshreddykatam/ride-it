import Razorpay from "razorpay";
import { createHmac } from "crypto";
import { getRazorpayKeyId, getRazorpayKeySecret, getRazorpayWebhookSecret } from "../env";
import type {
  CreateOrderParams,
  CreateOrderResult,
  InitiateRefundParams,
  PaymentProvider,
  RefundResult,
  VerifyPaymentParams,
  WebhookVerificationResult,
} from "../types";

/**
 * Built against razorpay@2.9.8's actual installed type definitions and
 * source (inspected directly in this session — real npm registry access
 * was available), not recalled from training data. Two things worth
 * flagging explicitly:
 *
 * - Payment signature verification (verifyPaymentSignature) is
 *   implemented with Node's own `crypto` module rather than importing
 *   the SDK's internal `validatePaymentVerification` helper — that
 *   helper lives in an internal `utils/` path not part of the package's
 *   documented public surface, so depending on it directly would be
 *   fragile across versions. The exact algorithm (confirmed by reading
 *   that helper's real source this session) is simply
 *   `HMAC-SHA256(secret, orderId + "|" + paymentId) === signature` —
 *   reimplemented here with the one genuinely public, documented API
 *   (Node's crypto) rather than an undocumented internal one.
 * - Webhook signature verification DOES use the SDK's own public static
 *   method, `Razorpay.validateWebhookSignature(body, signature, secret)`
 *   — confirmed present on the class's public type declaration.
 */
function createRazorpayClient(): Razorpay {
  return new Razorpay({ key_id: getRazorpayKeyId(), key_secret: getRazorpayKeySecret() });
}

export const razorpayProvider: PaymentProvider = {
  name: "razorpay",

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const client = createRazorpayClient();
    const order = await client.orders.create({
      amount: params.amountInSmallestUnit,
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes,
    });
    return {
      providerOrderId: order.id,
      amountInSmallestUnit: Number(order.amount),
      currency: order.currency,
    };
  },

  verifyPaymentSignature(params: VerifyPaymentParams): boolean {
    const secret = getRazorpayKeySecret();
    const payload = `${params.providerOrderId}|${params.providerPaymentId}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    return expected === params.signature;
  },

  verifyAndParseWebhook(rawBody: string, signatureHeader: string): WebhookVerificationResult {
    const secret = getRazorpayWebhookSecret();
    const valid = Razorpay.validateWebhookSignature(rawBody, signatureHeader, secret);

    if (!valid) {
      return { valid: false, eventId: "", eventType: "", providerOrderId: null, providerPaymentId: null, status: "unknown" };
    }

    const body = JSON.parse(rawBody) as {
      id?: string;
      event: string;
      payload: { payment?: { entity?: { id: string; order_id: string; status: string } } };
    };

    const paymentEntity = body.payload?.payment?.entity;
    const status: WebhookVerificationResult["status"] =
      body.event === "payment.captured" ? "captured" : body.event === "payment.failed" ? "failed" : "unknown";

    return {
      valid: true,
      eventId: body.id ?? `${body.event}:${paymentEntity?.id ?? "unknown"}`,
      eventType: body.event,
      providerOrderId: paymentEntity?.order_id ?? null,
      providerPaymentId: paymentEntity?.id ?? null,
      status,
    };
  },

  async initiateRefund(params: InitiateRefundParams): Promise<RefundResult> {
    const client = createRazorpayClient();
    const refund = await client.payments.refund(params.providerPaymentId, {
      amount: params.amountInSmallestUnit,
    });
    return { providerRefundId: refund.id, status: refund.status ?? "pending" };
  },
};
