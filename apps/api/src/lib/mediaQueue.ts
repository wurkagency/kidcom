import { Queue } from "bullmq";

import { config } from "../config";

// Shared BullMQ connection options — a plain object rather than reusing the
// existing ioredis client in apps/api/src/redis.ts, because BullMQ needs its
// own connection with specific options (maxRetriesPerRequest: null is
// already set there, which BullMQ also requires, but Queue/Worker each want
// their own underlying connection rather than sharing one client instance).
export const bullConnection = { url: config.redisUrl, maxRetriesPerRequest: null as null };

export type ProcessMediaJob = {
  mediaAssetId: string;
};

export const mediaQueue = new Queue<ProcessMediaJob>("process-media", {
  connection: bullConnection,
});
