/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// injectManifest fills this in at build time with the precache list
// (chunk 8 — switched from generateSW so this file can also handle push).
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
