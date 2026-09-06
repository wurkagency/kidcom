import { Queue } from "bullmq";

import { bullConnection } from "./mediaQueue";

export type PushJob = {
  userId: string;
  title: string;
  body: string;
  url?: string;
};

export const pushQueue = new Queue<PushJob>("send-push", {
  connection: bullConnection,
});
