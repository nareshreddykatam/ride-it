"use client";

import * as React from "react";
import { BellRing, BellOff } from "lucide-react";
import { Button } from "@ride-it/ui";
import {
  requestPushToken,
  registerNotificationDevice,
  getPushPermissionState,
  type PushPermissionState,
} from "@ride-it/data";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";

const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";
const FIREBASE_CONFIGURED = Boolean(FIREBASE_CONFIG.apiKey && VAPID_KEY);

/**
 * Push-notification opt-in for Settings. Handles every real state the
 * browser Notification permission can be in — including the ones that
 * can't be recovered from in-app (once a user denies, no website can
 * re-prompt; the only way back is the browser's own site-settings UI,
 * which this explains rather than pretending a retry button would work).
 */
export function PushNotificationSettings({ userId }: { userId: string }) {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [permission, setPermission] = React.useState<PushPermissionState>("default");
  const [registering, setRegistering] = React.useState(false);
  const [registered, setRegistered] = React.useState(false);

  React.useEffect(() => {
    setPermission(getPushPermissionState());
  }, []);

  async function handleEnable() {
    setRegistering(true);
    try {
      const token = await requestPushToken(FIREBASE_CONFIG, VAPID_KEY);
      setPermission(getPushPermissionState());
      if (token) {
        await registerNotificationDevice(supabase, userId, "web", token);
        setRegistered(true);
      }
    } finally {
      setRegistering(false);
    }
  }

  if (!FIREBASE_CONFIGURED) {
    return null; // Nothing to offer — no fake toggle for a feature that isn't wired up in this environment.
  }

  return (
    <div className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Push notifications</p>
      <div className="mt-2 rounded-lg border border-border bg-surface px-4 py-3.5">
        {permission === "granted" && registered ? (
          <div className="flex items-center gap-3">
            <BellRing size={18} className="shrink-0 text-meter-green-text" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Enabled on this device</p>
              <p className="text-xs text-ink-soft">You&apos;ll get ride updates and alerts even when the app is closed.</p>
            </div>
          </div>
        ) : permission === "denied" ? (
          <div className="flex items-center gap-3">
            <BellOff size={18} className="shrink-0 text-alert-red" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Blocked in your browser</p>
              <p className="text-xs text-ink-soft">
                Notifications were denied for this site. To enable them, allow notifications for Ridora in your
                browser&apos;s site settings, then reload this page.
              </p>
            </div>
          </div>
        ) : permission === "unsupported" ? (
          <div className="flex items-center gap-3">
            <BellOff size={18} className="shrink-0 text-ink-soft" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Not supported on this device</p>
              <p className="text-xs text-ink-soft">Your current browser doesn&apos;t support push notifications.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Get ride updates instantly</p>
              <p className="text-xs text-ink-soft">Driver arrival, ride status, and payment alerts — even when the app is closed.</p>
            </div>
            <Button size="sm" onClick={handleEnable} disabled={registering} className="shrink-0">
              {registering ? "Enabling…" : "Enable"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
