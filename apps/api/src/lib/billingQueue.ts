import { Queue } from "bullmq";

import { bullConnection } from "./mediaQueue";

export type RenewSubscriptionsJob = Record<string, never>;

export const billingQueue = new Queue<RenewSubscriptionsJob>("renew-subscriptions", {
  connection: bullConnection,
});
