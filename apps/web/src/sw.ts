/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope;

// vite.config.ts sets registerType: "autoUpdate", but that setting only
// controls the auto-injected *client* registration script — with a custom
// injectManifest service worker like this one, it's still this file's job
// to actually let a new build take over. Without these two calls, a newly
// deployed SW sits in "waiting" state behind the old active one until every
// open tab (including any installed PWA the "add to home screen" prompt
// created) is fully closed and reopened — which for most people is
// "never". That's what made a deploy look like it "didn't happen" (stale
// logo, stale bundle with pre-fix avatar code) even though the new files
// were live on the server the whole time.
self.skipWaiting();
clientsClaim();

// injectManifest fills this in at build time with the precache list
// (chunk 8 — switched from generateSW so this file can also handle push).
// cleanupOutdatedCaches drops the previous build's precache entries once
// this SW activates, instead of leaving them to accumulate.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload = { title: "KidCom", body: "" };
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch {
    // Non-JSON push payload — fall back to a generic notification rather
    // than dropping it silently.
    payload = { title: "KidCom", body: event.data?.text() ?? "" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data?.url as string | undefined) ?? "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clientsList.find((c) => "focus" in c);
      if (existing) {
        await (existing as WindowClient).focus();
        if ("navigate" in existing) {
          await (existing as WindowClient).navigate(url);
        }
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
