// Serves the Firebase Messaging service worker at /firebase-messaging-sw.js
// with real (still public, non-secret — see requestPushToken's docs)
// Firebase Web SDK config interpolated server-side. A plain static file
// under public/ can't do this: NEXT_PUBLIC_* values are inlined into the
// app bundle at build time by webpack, but a static public/ file is
// served byte-for-byte as-is and never touches that bundler pass. A
// Route Handler runs as normal server code, so process.env is available
// here exactly like any other server file.
//
// If Firebase isn't configured (no NEXT_PUBLIC_FIREBASE_* vars set),
// this serves a worker that installs and does nothing — background push
// is unavailable, not broken.

function buildServiceWorkerScript(): string {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };

  return `
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

const firebaseConfig = ${JSON.stringify(config)};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging.isSupported() ? firebase.messaging() : null;

  if (messaging) {
    messaging.onBackgroundMessage((payload) => {
      const title = (payload.notification && payload.notification.title) || "Ride It Driver";
      const body = (payload.notification && payload.notification.body) || "";
      const deepLink = (payload.data && payload.data.deep_link) || "/dashboard";
      self.registration.showNotification(title, { body, icon: "/icon-192.png", data: { deepLink } });
    });
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = (event.notification.data && event.notification.data.deepLink) || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const targetUrl = new URL(deepLink, self.location.origin).href;
      for (const client of windowClients) {
        if (client.url === targetUrl && "focus" in client) return client.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});
`.trim();
}

export async function GET() {
  return new Response(buildServiceWorkerScript(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
