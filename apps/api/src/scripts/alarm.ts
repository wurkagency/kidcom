// Legal hold (subscription model §4), until the management application
// has a screen for it. Run with the API's environment, e.g.
//
//   npm run alarm --workspace=apps/api -- create --media <mediaAssetId> --reason "Reported: potential abuse"
//   npm run alarm --workspace=apps/api -- create --child <childId> --reason "..."
//   npm run alarm --workspace=apps/api -- create --user <userId> --reason "..."
//   npm run alarm --workspace=apps/api -- archive <alarmId>
//   npm run alarm --workspace=apps/api -- list
//
// While active, the data is gone from the app for everyone and is never
// deleted. Archiving releases it to the normal rules.
/* eslint-disable no-console */
import { prisma } from "../db";
import { archiveAlarm, createAlarm, type AlarmTarget } from "../lib/alarms";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  if (command === "create") {
    const reason = arg("reason");
    if (!reason) throw new Error("--reason is required");
    const target: AlarmTarget | null = arg("media")
      ? { mediaAssetId: arg("media")! }
      : arg("child")
        ? { childId: arg("child")! }
        : arg("user")
          ? { userId: arg("user")! }
          : null;
    if (!target) throw new Error("Give one of --media, --child or --user");
    const alarm = await createAlarm(target, reason, arg("by") ?? null);
    console.log(`Alarm ${alarm.id} is active.`);
    return;
  }
  if (command === "archive") {
    const id = process.argv[3];
    if (!id) throw new Error("Give the alarm id");
    await archiveAlarm(id);
    console.log("Archived. Normal rules apply again.");
    return;
  }
  if (command === "list") {
    const alarms = await prisma.alarm.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    for (const a of alarms) {
      const target = a.mediaAssetId ? `media ${a.mediaAssetId}` : a.childId ? `child ${a.childId}` : `user ${a.userId}`;
      console.log(`${a.id}  ${a.status}  ${target}  ${a.createdAt.toISOString().slice(0, 10)}  ${a.reason}`);
    }
    if (alarms.length === 0) console.log("No alarms.");
    return;
  }
  console.log("Usage: alarm create (--media ID | --child ID | --user ID) --reason TEXT | archive ID | list");
  process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
