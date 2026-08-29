// Supabase Auth "Send SMS Hook" — the sole path OTP SMS delivery takes in
// production. Supabase Auth still owns OTP generation/verification
// entirely (signInWithOtp/verifyOtp, unchanged); this function's only job
// is relaying the OTP Supabase already generated to MSG91 for actual SMS
// delivery. It never generates, stores, or verifies an OTP itself.
//
// Contract (verified against Supabase's own docs before writing this):
//   request:  { user: { phone, ... }, sms: { otp: "^[0-9]{6}$" } }
//   success:  {} with HTTP 200
//   failure:  { error: { http_code, message } } with a non-200 status
//   auth:     Standard Webhooks signature, secret format "v1,whsec_<base64>"
//
// MSG91 SendOTP contract (verified against docs.msg91.com/otp/sendotp):
//   POST https://control.msg91.com/api/v5/otp
//     ?template_id=...&mobile=...&authkey=...&otp=...&otp_length=...
//   MSG91 supports relaying a pre-generated OTP via the "otp" param —
//   required here, since Supabase (not MSG91) is the source of truth for
//   the code, and the SMS text must match the number the user is asked
//   to enter.
//   response: { type: "success" | "error", message?: string }
import { Webhook } from "npm:standardwebhooks@1.0.0";

const MSG91_ENDPOINT = "https://control.msg91.com/api/v5/otp";

interface SendSmsHookPayload {
  user?: { phone?: string };
  sms?: { otp?: string };
}

interface Msg91Response {
  type?: string;
  message?: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: { http_code: 405, message: "Method not allowed" } }, 405);
  }

  const hookSecretRaw = Deno.env.get("SEND_SMS_HOOK_SECRET");
  if (!hookSecretRaw) {
    console.error("send-sms-hook: SEND_SMS_HOOK_SECRET is not configured");
    return jsonResponse({ error: { http_code: 500, message: "SMS hook is not configured" } }, 500);
  }

  const payloadText = await req.text();
  const headers = Object.fromEntries(req.headers);

  let event: SendSmsHookPayload;
  try {
    const base64Secret = hookSecretRaw.replace("v1,whsec_", "");
    const wh = new Webhook(base64Secret);
    event = wh.verify(payloadText, headers) as SendSmsHookPayload;
  } catch {
    // Deliberately no payload/header dump here — a failed-verification
    // request could still contain a real phone number or OTP.
    console.error("send-sms-hook: webhook signature verification failed");
    return jsonResponse({ error: { http_code: 401, message: "Invalid webhook signature" } }, 401);
  }

  const phone = event.user?.phone;
  const otp = event.sms?.otp;
  if (!phone || !otp) {
    console.error("send-sms-hook: verified payload missing user.phone or sms.otp");
    return jsonResponse({ error: { http_code: 400, message: "Malformed request" } }, 400);
  }

  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  const templateId = Deno.env.get("MSG91_TEMPLATE_ID");
  if (!authKey || !templateId) {
    console.error("send-sms-hook: MSG91_AUTH_KEY/MSG91_TEMPLATE_ID not configured — cannot deliver OTP SMS");
    return jsonResponse({ error: { http_code: 500, message: "SMS provider is not configured" } }, 500);
  }

  // MSG91 expects the number without a leading "+"; Supabase's phone is
  // already E.164 (e.g. "+919876543210").
  const mobile = phone.replace(/^\+/, "");

  const url = new URL(MSG91_ENDPOINT);
  url.searchParams.set("template_id", templateId);
  url.searchParams.set("mobile", mobile);
  url.searchParams.set("authkey", authKey);
  url.searchParams.set("otp", otp);
  url.searchParams.set("otp_length", String(otp.length));

  try {
    const msg91Res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const msg91Body = (await msg91Res.json().catch(() => null)) as Msg91Response | null;

    if (!msg91Res.ok || msg91Body?.type !== "success") {
      // Log the failure reason/status only — never the phone number or OTP.
      console.error("send-sms-hook: MSG91 rejected the send", {
        httpStatus: msg91Res.status,
        msg91Type: msg91Body?.type ?? "unknown",
      });
      return jsonResponse({ error: { http_code: 502, message: "SMS provider failed to send the message" } }, 502);
    }

    return jsonResponse({}, 200);
  } catch (err) {
    console.error("send-sms-hook: network error calling MSG91", err instanceof Error ? err.message : "unknown error");
    return jsonResponse({ error: { http_code: 502, message: "SMS provider is unreachable" } }, 502);
  }
});
