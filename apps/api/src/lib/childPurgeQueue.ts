import { Queue } from "bullmq";

import { bullConnection } from "./mediaQueue";

export type PurgeDeletedChildrenJob = Record<string, never>;

export const childPurgeQueue = new Queue<PurgeDeletedChildrenJob>("purge-deleted-children", {
  connection: bullConnection,
});
