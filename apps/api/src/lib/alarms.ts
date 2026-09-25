import { prisma } from "../db";

// Legal hold (subscription model §4). While an alarm is ACTIVE on media, a
// child or a user, that data is removed from the app for everyone (the
// uploader too) and never deleted — not by day-90 deletion, any clean-up,
// or the user's own delete. It stays available to authorised staff so it
// can be reported to the authorities. Archiving the alarm releases it to
// the normal rules again; anything whose deletion date has passed is then
// deleted at the next clean-up run.
//
// Media and user alarms are enforced where media is read and deleted
// (routes/media, lib/moments, lib/accountDeletion, lib/circleLifecycle). A
// child alarm also hides the child itself: its access rows move to
// suspended_child_access (LEGAL_HOLD), which every RLS policy respects.

export type AlarmTarget = { mediaAssetId: string } | { childId: string } | { userId: string };

export async function createAlarm(target: AlarmTarget, reason: string, createdBy: string | null = null) {
  const alarm = await prisma.alarm.create({ data: { ...target, reason, createdBy } });
  if ("childId" in target) {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.childAccess.findMany({ where: { childId: target.childId } });
      if (rows.length === 0) return;
      await tx.suspendedChildAccess.createMany({
        data: rows.map((r) => ({
          childId: r.childId,
          userId: r.userId,
          role: r.role,
          relationship: r.relationship,
          medicalInfoAccess: r.medicalInfoAccess,
          isMinorMember: r.isMinorMember,
          grantedViaCircleId: r.grantedViaCircleId,
          originalCreatedAt: r.createdAt,
          reason: "LEGAL_HOLD" as const,
        })),
        skipDuplicates: true,
      });
      await tx.childAccess.deleteMany({ where: { childId: target.childId } });
    });
  }
  return alarm;
}

export async function archiveAlarm(alarmId: string): Promise<void> {
  const alarm = await prisma.alarm.update({ where: { id: alarmId }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  if (!alarm.childId) return;
  const stillHeld = await prisma.alarm.count({ where: { childId: alarm.childId, status: "ACTIVE" } });
  if (stillHeld > 0) return;
  await prisma.$transaction(async (tx) => {
    const rows = await tx.suspendedChildAccess.findMany({ where: { childId: alarm.childId!, reason: "LEGAL_HOLD" } });
    if (rows.length === 0) return;
    await tx.childAccess.createMany({
      data: rows.map((r) => ({
        childId: r.childId,
        userId: r.userId,
        role: r.role,
        relationship: r.relationship,
        medicalInfoAccess: r.medicalInfoAccess,
        isMinorMember: r.isMinorMember,
        grantedViaCircleId: r.grantedViaCircleId,
        createdAt: r.originalCreatedAt,
      })),
      skipDuplicates: true,
    });
    await tx.suspendedChildAccess.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  });
}
