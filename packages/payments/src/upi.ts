import QRCode from "qrcode";

/**
 * Direct driver UPI QR — distinct from and never mixed with the Razorpay
 * ("RideIt Online") flow elsewhere in this package. This module only ever
 * builds a standard UPI deep link and renders it as a QR image; it never
 * talks to a payment gateway and never confirms a payment. Both driver
 * and passenger apps generate the identical QR from the identical inputs
 * client-side — there is nothing secret in a UPI payment URI (it's
 * exactly what a driver would hand someone as a printed QR code), so
 * there is no security reason to generate it server-side.
 */
export interface UpiPaymentDetails {
  /** The driver's own registered VPA, e.g. "driver@upi" — never client-editable; callers must source this from an authoritative read (the driver's own profile, or a server RPC scoped to the ride's assigned driver). */
  upiId: string;
  /** Payee display name shown by the paying UPI app — the driver's name where known. */
  payeeName: string;
  /** The exact amount to request — callers must source this from rides.total_fare for the specific completed ride, never a client-held estimate. */
  amount: number;
  /** Optional short note shown in the paying UPI app — no ride/personal details beyond a generic label. */
  note?: string;
}

/**
 * Builds a standard UPI deep link (the same "upi://pay?..." scheme every
 * UPI app — GPay, PhonePe, Paytm, BHIM — already recognizes). No secrets,
 * no gateway credentials, nothing beyond what a driver's own printed QR
 * code would already encode.
 */
export function buildUpiPaymentUri({ upiId, payeeName, amount, note }: UpiPaymentDetails): string {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: "INR",
  });
  if (note) params.set("tn", note);
  return `upi://pay?${params.toString()}`;
}

/**
 * Renders a UPI URI (or any string) as a scannable QR code, returned as a
 * data: URL suitable for a plain <img src>. Runs entirely client-side —
 * no network call, no server round-trip. Error-correction level "M"
 * (~15% recovery) is the standard default UPI QR generators use, giving
 * real-world phone cameras enough margin to scan reliably even at a
 * modest render size.
 */
export async function generateUpiQrDataUrl(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });
}
