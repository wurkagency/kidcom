import { Queue } from "bullmq";

import { bullConnection } from "./mediaQueue";

export type RenewSubscriptionsJob = Record<string, never>;

export const billingQueue = new Queue<RenewSubscriptionsJob>("renew-subscriptions", {
  connection: bullConnection,
});

// Post-launch backlog Phase E (D7) — separate queue/job from renewals
// above, same connection, registered the same idempotent way in worker.ts.
export type ReconcileSubscriptionsJob = Record<string, never>;

export const reconciliationQueue = new Queue<ReconcileSubscriptionsJob>("reconcile-subscriptions", {
  connection: bullConnection,
});
