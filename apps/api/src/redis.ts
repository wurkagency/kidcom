import Redis from "ioredis";

import { config } from "./config";

// Single shared Redis connection, reused for both the session store here and
// BullMQ once the jobs chunk lands (BullMQ wants its own connection options,
// but this is the one place that knows the Redis URL).
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

redis.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Redis connection error:", err.message);
});
