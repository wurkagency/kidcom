// Standalone BullMQ worker process — matches the `dist/worker.js` entrypoint
// DEPLOYMENT.md already documents (systemd service on the Plesk VM, not
// Passenger-managed since it's long-running rather than request-driven).
// Run locally with `npm run worker` (or as part of `npm run dev` via the
// root concurrently script).
import "dotenv/config";
import { Worker } from "bullmq";
import path from "node:path";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

import { prisma } from "./db";
import { bullConnection, type ProcessMediaJob } from "./lib/mediaQueue";
import { mediaStorage } from "./lib/mediaStorage";
import { billingQueue, type RenewSubscriptionsJob } from "./lib/billingQueue";
import { BILLING_PERIOD_DAYS, BILLING_PRICES_ORE } from "./lib/billingPricing";
import * as quickpay from "./lib/quickpay";
import { pushQueue, type PushJob } from "./lib/pushQueue";
import { sendPushToUser } from "./lib/webPush";
import { remindersQueue, type RemindAppointmentsJob } from "./lib/remindersQueue";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

async function processImage(originalKey: string, assetId: string) {
  const derivedKey = `derived/${assetId}.webp`;
  const image = sharp(mediaStorage.pathFor(originalKey)).rotate();
  const metadata = await image.metadata();
  const derivedPath = mediaStorage.pathFor(derivedKey);
  await sharp(mediaStorage.pathFor(originalKey))
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(derivedPath);
  return { derivedKey, width: metadata.width ?? null, height: metadata.height ?? null };
}

async function processVideo(originalKey: string, assetId: string) {
  const originalPath = mediaStorage.pathFor(originalKey);
  const derivedKey = `derived/${assetId}.jpg`; // poster frame — used as the feed thumbnail
  const derivedPath = mediaStorage.pathFor(derivedKey);
  const outDir = path.dirname(derivedPath);

  const dimensions = await new Promise<{ width: number | null; height: number | null }>(
    (resolve, reject) => {
      ffmpeg.ffprobe(originalPath, (err, data) => {
        if (err) return reject(err);
        const stream = data.streams.find((s) => s.width && s.height);
        resolve({ width: stream?.width ?? null, height: stream?.height ?? null });
      });
    }
  );

  await new Promise<void>((resolve, reject) => {
    ffmpeg(originalPath)
      .on("end", () => resolve())
      .on("error", reject)
      .screenshots({ count: 1, folder: outDir, filename: path.basename(derivedPath), timestamps: ["1"] });
  });

  return { derivedKey, ...dimensions };
}

const worker = new Worker<ProcessMediaJob>(
  "process-media",
  async (job) => {
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: job.data.mediaAssetId } });
    try {
      const result =
        asset.type === "IMAGE"
          ? await processImage(asset.originalPath, asset.id)
          : await processVideo(asset.originalPath, asset.id);

      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: "READY",
          derivedPath: result.derivedKey,
          width: result.width,
          height: result.height,
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to process media asset ${asset.id}:`, err);
      await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "FAILED" } });
    }
  },
  { connection: bullConnection }
);

worker.on("ready", () => {
  // eslint-disable-next-line no-console
  console.log("KidCom media worker ready, listening for process-media jobs");
});

worker.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Media worker error:", err);
});

// Daily renewal job — charges the next period for any active, non-Free
// subscription whose currentPeriodEnd has arrived. Optimistic: extends
// currentPeriodEnd as soon as the QuickPay API call succeeds rather than
// waiting for the payment webhook, since chargeRecurring's response
// confirms QuickPay accepted the charge attempt (a subsequent failure would
// still need to show up via the webhook — same PENDING/PAST_DUE handling as
// the initial checkout, not duplicated here for now).
const billingWorker = new Worker<RenewSubscriptionsJob>(
  "renew-subscriptions",
  async () => {
    const due = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        tier: { in: ["PARENTS", "FAMILY"] },
        currentPeriodEnd: { lte: new Date() },
      },
    });

    for (const sub of due) {
      if (!sub.quickpaySubscriptionId || !sub.billingPeriod) continue;
      try {
        const amount = BILLING_PRICES_ORE[sub.tier as "PARENTS" | "FAMILY"][sub.billingPeriod as "MONTHLY" | "ANNUAL"];
        const orderId = `renew${Date.now().toString(36)}`.slice(0, 20);
        await quickpay.chargeRecurring({
          subscriptionId: Number(sub.quickpaySubscriptionId),
          amountMinorUnits: amount,
          orderId,
        });
        const periodDays = BILLING_PERIOD_DAYS[sub.billingPeriod as "MONTHLY" | "ANNUAL"];
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { currentPeriodEnd: new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000) },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Renewal charge failed for subscription ${sub.id}:`, err);
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } });
      }
    }
  },
  { connection: bullConnection }
);

billingWorker.on("ready", async () => {
  // Idempotent — BullMQ dedupes repeatable jobs by their repeat key, so
  // re-adding this on every worker boot doesn't create duplicates.
  await billingQueue.add(
    "renew-subscriptions",
    {},
    { repeat: { pattern: "0 3 * * *" } } // 03:00 daily
  );
  // eslint-disable-next-line no-console
  console.log("KidCom billing worker ready, renew-subscriptions scheduled daily at 03:00");
});

billingWorker.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Billing worker error:", err);
});

// Fans out a single push notification to every device the target user has
// subscribed on (see lib/webPush.ts). Fire-and-forget — enqueued from
// messages/index.ts and children/swapRequests.ts, and from the reminder
// scan job below.
const pushWorker = new Worker<PushJob>(
  "send-push",
  async (job) => {
    await sendPushToUser(job.data.userId, {
      title: job.data.title,
      body: job.data.body,
      url: job.data.url,
    });
  },
  { connection: bullConnection }
);

pushWorker.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Push worker error:", err);
});

// Hourly scan for appointments starting in the next ~24h that haven't been
// reminded yet — pushes every ChildAccess user for that child and stamps
// remindedAt so it's never sent twice. Running hourly (rather than once a
// day) tightens the effective lead time from anywhere between 1-24h down to
// roughly 23-24h, since the window is now re-checked every hour instead of
// once at a fixed daily time.
const remindersWorker = new Worker<RemindAppointmentsJob>(
  "remind-appointments",
  async () => {
    const windowEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dueEvents = await prisma.calendarEvent.findMany({
      where: {
        category: "APPOINTMENT",
        remindedAt: null,
        startsAt: { gte: new Date(), lte: windowEnd },
      },
      include: { child: { include: { access: true } } },
    });

    for (const event of dueEvents) {
      await Promise.all(
        event.child.access.map((a) =>
          pushQueue.add("send-push", {
            userId: a.userId,
            title: "Upcoming appointment",
            body: `${event.title} — ${event.startsAt.toLocaleString()}`,
            url: "/calendar",
          })
        )
      );
      await prisma.calendarEvent.update({ where: { id: event.id }, data: { remindedAt: new Date() } });
    }
  },
  { connection: bullConnection }
);

remindersWorker.on("ready", async () => {
  // Idempotent — BullMQ dedupes repeatable jobs by their repeat key.
  await remindersQueue.add("remind-appointments", {}, { repeat: { pattern: "0 * * * *" } }); // hourly, on the hour
  // eslint-disable-next-line no-console
  console.log("KidCom reminders worker ready, remind-appointments scheduled hourly");
});

remindersWorker.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Reminders worker error:", err);
});
