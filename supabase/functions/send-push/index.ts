// Sends a push notification for one public.notifications row to every
// registered, push-enabled device for that row's user. Called only by
// the _dispatch_push_for_notification() DB trigger (see migration
// 20260828090000_push_notification_dispatch.sql) via pg_net — never by a
// client directly, and never reachable without the shared secret below.
//
// FCM HTTP v1 contract (verified against firebase.google.com/docs/
// cloud-messaging/send/v1-api before writing this):
//   POST https://fcm.googleapis.com/v1/{projectId}/messages:send
//   Authorization: Bearer <OAuth2 access token, minted from a service
//     account JSON key via the JWT-bearer grant — the legacy static
//     server-key API this used to use is retired>
//   body: { message: { token, notification: {title, body}, data: {...},
//            webpush: { fcm_options: { link } } } }
import { createClient } from "npm:@supabase/supabase-js@2";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface DispatchPayload {
  notification_id?: string;
  user_id?: string;
  type?: string;
  title?: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
}

interface DeviceRow {
  id: string;
  push_token: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

/** Mints a short-lived OAuth2 access token from a Google service-account key — the documented JWT-bearer flow, no Admin SDK (not Deno-compatible) required. */
async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const enc = (obj: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: sa.client_email,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  })}`;
  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

/** Same route-naming convention on both passenger and driver apps; the client's own service worker resolves this path against its own origin, so this function never needs to know which app a device belongs to. */
function deepLinkFor(type: string | undefined, data: Record<string, unknown> | null | undefined): string {
  const rideId = typeof data?.ride_id === "string" ? data.ride_id : null;
  switch (type) {
    case "offer":
      return "/dashboard";
    case "ride_status":
    case "driver_arrival":
      return rideId ? `/ride/${rideId}` : "/home";
    case "payment_confirmation":
      return rideId ? `/ride/${rideId}/complete` : "/history";
    case "subscription":
      return "/subscription";
    default:
      return "/notifications";
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("PUSH_DISPATCH_SECRET");
  const providedSecret = req.headers.get("x-push-dispatch-secret") ?? "";
  if (!expectedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    console.error("send-push: rejected request with missing/invalid dispatch secret");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const payload = (await req.json().catch(() => null)) as DispatchPayload | null;
  if (!payload?.user_id || !payload.title) {
    return jsonResponse({ error: "Malformed request" }, 400);
  }

  const serviceAccountJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  const fcmProjectId = Deno.env.get("FCM_PROJECT_ID");
  if (!serviceAccountJson || !fcmProjectId) {
    console.warn("send-push: FCM not configured (FCM_SERVICE_ACCOUNT_JSON/FCM_PROJECT_ID missing) — skipping", {
      notificationId: payload.notification_id,
    });
    return jsonResponse({ skipped: true, reason: "fcm_not_configured" }, 200);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("send-push: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing from function environment");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: devices, error: devicesError } = await admin
    .from("notification_devices")
    .select("id, push_token")
    .eq("user_id", payload.user_id)
    .eq("push_enabled", true);

  if (devicesError) {
    console.error("send-push: failed to load devices", devicesError.message);
    return jsonResponse({ error: "Failed to load devices" }, 500);
  }
  if (!devices || devices.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, cleanedUp: 0, reason: "no_registered_devices" }, 200);
  }

  let serviceAccount: ServiceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
  } catch {
    console.error("send-push: FCM_SERVICE_ACCOUNT_JSON is not valid JSON");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(serviceAccount);
  } catch (err) {
    console.error("send-push: failed to mint Google access token", err instanceof Error ? err.message : "unknown");
    return jsonResponse({ error: "FCM auth failed" }, 502);
  }

  const deepLink = deepLinkFor(payload.type, payload.data);
  const dataPayload: Record<string, string> = {
    type: payload.type ?? "system",
    deep_link: deepLink,
  };
  if (payload.notification_id) dataPayload.notification_id = payload.notification_id;

  let sent = 0;
  let failed = 0;
  const invalidDeviceIds: string[] = [];

  await Promise.all(
    (devices as DeviceRow[]).map(async (device) => {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/${fcmProjectId}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token: device.push_token,
              notification: { title: payload.title, body: payload.body ?? undefined },
              data: dataPayload,
              webpush: { fcm_options: { link: deepLink } },
            },
          }),
        });

        if (res.ok) {
          sent++;
          return;
        }

        const errBody = (await res.json().catch(() => null)) as { error?: { status?: string } } | null;
        const status = errBody?.error?.status;
        // UNREGISTERED / NOT_FOUND / an invalid-token INVALID_ARGUMENT all
        // mean this token will never succeed again — clean it up rather
        // than retry it on every future notification.
        if (status === "UNREGISTERED" || status === "NOT_FOUND" || status === "INVALID_ARGUMENT") {
          invalidDeviceIds.push(device.id);
        }
        failed++;
        console.error("send-push: FCM send failed", { deviceId: device.id, status: status ?? res.status });
      } catch (err) {
        failed++;
        console.error("send-push: network error sending to device", device.id, err instanceof Error ? err.message : "unknown");
      }
    })
  );

  if (invalidDeviceIds.length > 0) {
    const { error: cleanupError } = await admin.from("notification_devices").delete().in("id", invalidDeviceIds);
    if (cleanupError) console.error("send-push: failed to clean up invalid devices", cleanupError.message);
  }

  return jsonResponse({ sent, failed, cleanedUp: invalidDeviceIds.length }, 200);
});
