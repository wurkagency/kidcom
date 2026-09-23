// Standalone BullMQ worker process — matches the `dist/worker.js` entrypoint
// docs/plesk_deployment.md already documents (systemd service on the Plesk VM, not
// Passenger-managed since it's long-running rather than request-driven).
// Run locally with `npm run worker` (or as part of `npm run dev` via the
// root concurrently script).
import "dotenv/config";
import { Worker } from "bullmq";

import { systemCategoryId } from "@kidcom/shared";

import { prisma } from "./db";
import { withRlsBypass } from "./lib/rls";
import { bullConnection, type ProcessMediaJob } from "./lib/mediaQueue";
import { processImage, processVideo, processedColumns } from "./lib/mediaProcessing";
import { billingQueue, reconciliationQueue, type RenewSubscriptionsJob, type ReconcileSubscriptionsJob } from "./lib/billingQueue";
import { BILLING_PERIOD_DAYS, BILLING_PRICES_ORE } from "./lib/billingPricing";
import * as quickpay from "./lib/quickpay";
import { reconcilePendingSubscriptions } from "./lib/billingReconciliation";
import { type PushJob } from "./lib/pushQueue";
import { sendPushToUser } from "./lib/webPush";
import { remindersQueue, type RemindAppointmentsJob } from "./lib/remindersQueue";
import { childPurgeQueue, type PurgeDeletedChildrenJob } from "./lib/childPurgeQueue";
import { purgeExpiredDeletedChildren } from "./lib/childPurge";
import { purgeExpiredLoginEvents } from "./lib/loginEvents";
import { mediaStorage } from "./lib/mediaStorage";
import { notify } from "./lib/notify";



const worker = new Worker<ProcessMediaJob>(
  "process-media",
  async (job) => {
    // System-level: this job has no per-request user, and legitimately
    // needs to update any media asset regardless of who owns/tagged it.
    const asset = await withRlsBypass((tx) => tx.mediaAsset.findUniqueOrThrow({ where: { id: job.data.mediaAssetId } }));
    try {
      const result = asset.type === "IMAGE" ? await processImage(asset) : await processVideo(asset);
      await withRlsBypass((tx) => tx.mediaAsset.update({ where: { id: asset.id }, data: processedColumns(result) }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to process media asset ${asset.id}:`, err);
      await withRlsBypass((tx) => tx.mediaAsset.update({ where: { id: asset.id }, data: { status: "FAILED" } }));
    }
  },
  { connection: bullConnection }
);

worker.on("ready", () => {
  void mediaStorage.cleanScratch(0); // nothing is in flight yet: anything there is a crash leftover
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
        const orderId = `renew${Date.now().toString(36)}${sub.id.slice(-4)}`.slice(0, 20);
        await quickpay.chargeRecurring({
          subscriptionId: Number(sub.quickpaySubscriptionId),
          amountMinorUnits: amount,
          orderId,
        });
        const periodDays = BILLING_PERIOD_DAYS[sub.billingPeriod as "MONTHLY" | "ANNUAL"];
        await prisma.subscription.update({
          where: { id: sub.id },
          // The payment callback finds this subscription by the order_id.
          data: { currentPeriodEnd: new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000), lastChargeOrderId: orderId },
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

// Post-launch backlog Phase E (D7) — cleans up subscriptions abandoned
// mid-checkout (see lib/billingReconciliation.ts's own comment for why).
// Separate queue/worker from renewals above so a slow QuickPay lookup here
// never delays the renewal job's own run.
const reconciliationWorker = new Worker<ReconcileSubscriptionsJob>(
  "reconcile-subscriptions",
  async () => {
    const { healed, reverted } = await reconcilePendingSubscriptions();
    if (healed || reverted) {
      // eslint-disable-next-line no-console
      console.log(`reconcile-subscriptions: healed ${healed}, reverted ${reverted}`);
    }
  },
  { connection: bullConnection }
);

reconciliationWorker.on("ready", async () => {
  await reconciliationQueue.add(
    "reconcile-subscriptions",
    {},
    { repeat: { pattern: "30 3 * * *" } } // 03:30 daily, just after renewals
  );
  // eslint-disable-next-line no-console
  console.log("KidCom reconciliation worker ready, reconcile-subscriptions scheduled daily at 03:30");
});

reconciliationWorker.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Reconciliation worker error:", err);
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
    // System-level: scans across every child in the system, not one user's
    // — no single current_user_id could ever legitimately see all of it.
    const dueEvents = await withRlsBypass((tx) =>
      tx.calendarEvent.findMany({
        where: {
          // Timed appointments and health visits (not routines, holidays…).
          kind: "EVENT",
          allDay: false,
          categoryId: { in: [systemCategoryId("appointment"), systemCategoryId("health")] },
          remindedAt: null,
          startsAt: { gte: new Date(), lte: windowEnd },
        },
        include: { child: { include: { access: true } } },
      })
    );

    for (const event of dueEvents) {
      await notify(
        event.child.access.map((a) => a.userId),
        {
          kind: "appointment.reminder",
          params: { title: event.title, startsAt: event.startsAt.toISOString() },
          url: `/children/${event.childId}/events/${event.id}`,
          childId: event.childId,
        }
      );
      await withRlsBypass((tx) => tx.calendarEvent.update({ where: { id: event.id }, data: { remindedAt: new Date() } }));
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

// Post-launch backlog Phase H — the GDPR-retention follow-through Phase
// 10's soft-delete/30-day-restore window needed but never got: hard-
// deletes any Child whose deletedAt is more than RESTORE_WINDOW_DAYS in
// the past (see lib/childPurge.ts). Content cascades via the same
// onDelete: Cascade relations every other Child.delete() call relies on.
const childPurgeWorker = new Worker<PurgeDeletedChildrenJob>(
  "purge-deleted-children",
  async () => {
    const { purged } = await purgeExpiredDeletedChildren();
    if (purged) {
      // eslint-disable-next-line no-console
      console.log(`purge-deleted-children: hard-deleted ${purged} child(ren) past their restore window`);
    }
    // Same daily run: login events past retention, stray plaintext scratch files.
    const events = await purgeExpiredLoginEvents();
    await prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } } });
    const scratch = await mediaStorage.cleanScratch();
    if (events || scratch) {
      // eslint-disable-next-line no-console
      console.log(`daily purge: ${events} login event(s) past 12 months, ${scratch} stray media scratch file(s)`);
    }
  },
  { connection: bullConnection }
);

childPurgeWorker.on("ready", async () => {
  await childPurgeQueue.add("purge-deleted-children", {}, { repeat: { pattern: "0 4 * * *" } }); // daily at 04:00
  // eslint-disable-next-line no-console
  console.log("KidCom child-purge worker ready, purge-deleted-children scheduled daily at 04:00");
});

childPurgeWorker.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Child-purge worker error:", err);
});
