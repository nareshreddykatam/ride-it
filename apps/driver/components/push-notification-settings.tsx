"use client";

import * as React from "react";
import { BellRing, BellOff } from "lucide-react";
import { Button, Card } from "@ride-it/ui";
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
 * Push-notification opt-in for the driver Profile screen — a driver
 * offline/away from the app still needs to know about new ride requests,
 * so this is the one notification category where being unreachable has
 * a direct earnings cost, not just a convenience loss.
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
    return null;
  }

  return (
    <Card className="mt-3">
      {permission === "granted" && registered ? (
        <div className="flex items-center gap-3">
          <BellRing size={18} className="shrink-0 text-meter-green-text" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Push alerts enabled</p>
            <p className="text-xs text-ink-soft">You&apos;ll be notified of new ride requests even when the app is backgrounded.</p>
          </div>
        </div>
      ) : permission === "denied" ? (
        <div className="flex items-center gap-3">
          <BellOff size={18} className="shrink-0 text-alert-red" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Blocked in your browser</p>
            <p className="text-xs text-ink-soft">
              Allow notifications for Ride It Driver in your browser&apos;s site settings, then reload this page.
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
            <p className="text-sm font-medium text-ink">Don&apos;t miss a ride request</p>
            <p className="text-xs text-ink-soft">Get alerted the moment a new request arrives, even if the app isn&apos;t open.</p>
          </div>
          <Button size="sm" onClick={handleEnable} disabled={registering} className="shrink-0">
            {registering ? "Enabling…" : "Enable"}
          </Button>
        </div>
      )}
    </Card>
  );
}
