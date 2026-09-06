import webpush from "web-push";

import { prisma } from "../db";
import { config } from "../config";

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    throw new Error("Push isn't configured (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY missing)");
  }
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

// Sends to every device this user has subscribed on. Best-effort: a
// dead/expired subscription (404/410 from the push service) is deleted so
// it stops being retried; any other failure is logged and skipped — push
// delivery is inherently fire-and-forget, not a guaranteed channel.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  ensureConfigured();

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          // eslint-disable-next-line no-console
          console.error(`Push send failed for subscription ${sub.id}:`, err);
        }
      }
    })
  );
}
