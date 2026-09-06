import { Queue } from "bullmq";

import { bullConnection } from "./mediaQueue";

export type RemindAppointmentsJob = Record<string, never>;

export const remindersQueue = new Queue<RemindAppointmentsJob>("remind-appointments", {
  connection: bullConnection,
});
