/**
 * Detects whether a single free-text login input is an email address or an
 * Indian mobile number, so the unified "Continue" flow (Phase A) can route
 * to the correct existing OTP mechanism without asking the user to pick a
 * tab first.
 *
 * Deliberately reuses the exact phone-shape rule already enforced
 * elsewhere in this codebase (public.users_phone_format's
 * `^[6-9][0-9]{9}$`, mirrored in phone-otp.ts's own local-phone
 * assumption) rather than inventing a new heuristic — a 10-digit local
 * number is the only phone shape this app has ever accepted, in the UI or
 * the database.
 */

const PHONE_LOCAL_10_DIGIT = /^[6-9][0-9]{9}$/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type IdentifierType = "email" | "phone" | "invalid";

export interface DetectedIdentifier {
  type: IdentifierType;
  /** For type "phone": the normalized bare 10-digit local number (no +91, no spaces/dashes). For type "email": the trimmed, lowercased address. Empty string for "invalid". */
  value: string;
}

/**
 * Strips spaces, dashes, and a leading +91/91 country-code prefix (both
 * common real-world variants of typing an Indian mobile number) before
 * checking the 10-digit shape — this is intentionally the ONLY phone
 * normalization applied; anything that still doesn't match the exact
 * `[6-9][0-9]{9}` shape after this is correctly rejected as invalid
 * rather than guessed at further.
 */
function normalizeCandidatePhone(raw: string): string {
  const stripped = raw.replace(/[\s-]/g, "");
  if (stripped.startsWith("+91")) return stripped.slice(3);
  if (stripped.startsWith("91") && stripped.length === 12) return stripped.slice(2);
  return stripped;
}

/**
 * Classifies a raw login-input string. Order matters: a string containing
 * "@" can never validly be a phone number, so it's checked for email
 * shape first; anything else is checked against the phone shape after
 * normalization. Whitespace-only or empty input is "invalid", not
 * silently coerced to either type.
 */
export function detectIdentifier(rawInput: string): DetectedIdentifier {
  const trimmed = rawInput.trim();
  if (!trimmed) return { type: "invalid", value: "" };

  if (trimmed.includes("@")) {
    const lowered = trimmed.toLowerCase();
    return EMAIL_SHAPE.test(lowered) ? { type: "email", value: lowered } : { type: "invalid", value: "" };
  }

  const normalizedPhone = normalizeCandidatePhone(trimmed);
  return PHONE_LOCAL_10_DIGIT.test(normalizedPhone) ? { type: "phone", value: normalizedPhone } : { type: "invalid", value: "" };
}
