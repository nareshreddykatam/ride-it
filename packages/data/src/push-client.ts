import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export type PushPermissionState = "unsupported" | "default" | "granted" | "denied";

/** Browser Notification permission, without ever calling requestPermission() — read-only status check for rendering UI state. */
export function getPushPermissionState(): PushPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PushPermissionState;
}

let cachedApp: FirebaseApp | null = null;
function getFirebaseApp(config: FirebaseWebConfig): FirebaseApp {
  if (!cachedApp) cachedApp = getApps().length ? getApps()[0]! : initializeApp(config);
  return cachedApp;
}

/**
 * Requests Notification permission if not already decided, and — only if
 * granted — registers the FCM service worker and obtains a push token.
 * Returns null (never throws) for every "push isn't available right now"
 * case: unsupported browser, permission denied/dismissed, or FCM not
 * configured for this app. Callers register the returned token via
 * registerNotificationDevice(); a null return means "nothing to register,"
 * not an error to surface to the user.
 */
export async function requestPushToken(
  config: FirebaseWebConfig,
  vapidKey: string,
  swPath = "/firebase-messaging-sw.js"
): Promise<string | null> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return null;

  try {
    if (!(await isSupported())) return null;
  } catch {
    return null;
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return null;

  try {
    const registration = await navigator.serviceWorker.register(swPath);
    const messaging = getMessaging(getFirebaseApp(config));
    return await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  } catch (err) {
    console.error("requestPushToken: failed to obtain a push token", err instanceof Error ? err.message : "unknown error");
    return null;
  }
}

export interface ForegroundPushPayload {
  title?: string;
  body?: string;
  deepLink?: string;
}

/** Foreground messages don't trigger the service worker's own notification UI — the app must show its own toast/banner and handle the click itself. Returns an unsubscribe function. */
export function onForegroundPush(config: FirebaseWebConfig, handler: (payload: ForegroundPushPayload) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const messaging = getMessaging(getFirebaseApp(config));
  return onMessage(messaging, (payload) => {
    handler({
      title: payload.notification?.title,
      body: payload.notification?.body,
      deepLink: payload.data?.deep_link,
    });
  });
}
