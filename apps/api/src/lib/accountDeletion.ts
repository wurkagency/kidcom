import { prisma } from "../db";
import { ApiError } from "../middleware/errorHandler";
import { mediaStorage } from "./mediaStorage";
import { withRlsBypass } from "./rls";

// DELETE /auth/me — decided 2026-09-23 (docs/data_retention_policy.md):
// the account goes, the family's shared history stays.
//
// The user row is kept as an anonymous tombstone so moments, comments,
// photos, messages, list claims and requests keep a valid author; every
// personal field is cleared and it shows everywhere as "Former member".
// Sign-in becomes impossible (no email, password, phone or provider link).
//
// Refused while the person is the last parent/guardian of a child others
// still follow — the child must never be left without someone responsible.
// A child only they could see is soft-deleted (purged after the restore
// window by the daily job).

export const FORMER_MEMBER_NAME = "Former member";

const tombstoneEmail = (userId: string) => `deleted+${userId}@kidcom.invalid`;

export type DeletionBlocked = { childId: string; firstName: string }[];

/** Children that would be left without a parent or guardian. */
export async function childrenBlockingDeletion(userId: string): Promise<DeletionBlocked> {
  const mine = await withRlsBypass((tx) =>
    tx.childAccess.findMany({
      where: { userId, role: { in: ["PARENT", "GUARDIAN"] }, child: { deletedAt: null } },
      include: { child: { include: { access: { select: { userId: true, role: true } } } } },
    })
  );
  return mine
    .filter((a) => {
      const others = a.child.access.filter((x) => x.userId !== userId);
      return others.length > 0 && !others.some((x) => x.role === "PARENT" || x.role === "GUARDIAN");
    })
    .map((a) => ({ childId: a.childId, firstName: a.child.firstName }));
}

async function deleteFiles(assets: { originalPath: string | null; derivedPath: string | null; playablePath: string | null; sharedOriginalPath: string | null }[]) {
  const keys = assets.flatMap((a) => [a.originalPath, a.derivedPath, a.playablePath, a.sharedOriginalPath]).filter((k): k is string => !!k);
  await Promise.all(keys.map((k) => mediaStorage.delete(k).catch(() => undefined)));
}

export async function deleteAccount(userId: string): Promise<void> {
  const blocked = await childrenBlockingDeletion(userId);
  if (blocked.length > 0) {
    throw new ApiError(409, "You're the last parent or guardian of a child others still follow", "LAST_GUARDIAN", { children: blocked });
  }

  // Personal files: the profile photo and uploads never attached to anything.
  const personalAssets = await withRlsBypass((tx) =>
    tx.mediaAsset.findMany({
      where: {
        ownerId: userId,
        OR: [
          { avatarForUserId: userId },
          { momentId: null, avatarForChildId: null, coverForChildId: null, listItemImageForId: null, avatarForUserId: null },
        ],
      },
    })
  );
  const sentInMessages = new Set(
    (await prisma.message.findMany({ where: { mediaId: { in: personalAssets.map((a) => a.id) } }, select: { mediaId: true } })).map((m) => m.mediaId)
  );
  const toRemove = personalAssets.filter((a) => a.avatarForUserId === userId || !sentInMessages.has(a.id));

  await withRlsBypass(async (tx) => {
    const access = await tx.childAccess.findMany({ where: { userId }, include: { child: { include: { access: { select: { userId: true } } } } } });
    const aloneWith = access.filter((a) => a.child.access.every((x) => x.userId === userId)).map((a) => a.childId);

    await tx.childAccess.deleteMany({ where: { userId } });
    if (aloneWith.length) await tx.child.updateMany({ where: { id: { in: aloneWith }, deletedAt: null }, data: { deletedAt: new Date() } });

    await tx.oAuthAccount.deleteMany({ where: { userId } });
    await tx.phoneVerificationCode.deleteMany({ where: { userId } });
    await tx.passwordHistory.deleteMany({ where: { userId } });
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.loginTwoFactorCode.deleteMany({ where: { userId } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.notificationPreferences.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.personalNote.deleteMany({ where: { userId } });
    await tx.bookmark.deleteMany({ where: { userId } });
    await tx.mediaDownloadLink.deleteMany({ where: { userId } });
    await tx.momentReaction.deleteMany({ where: { userId } });
    await tx.threadMember.deleteMany({ where: { userId } });
    await tx.invite.deleteMany({ where: { invitedById: userId, acceptedAt: null } });
    await tx.upgradeRequest.deleteMany({ where: { requestedById: userId } });
    await tx.mediaAsset.deleteMany({ where: { id: { in: toRemove.map((a) => a.id) } } });
    await tx.subscription.updateMany({
      where: { ownerId: userId },
      data: { tier: "FREE", status: "CANCELED", billingPeriod: null, currentPeriodEnd: null, quickpaySubscriptionId: null, pastDueSince: null },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        email: tombstoneEmail(userId),
        firstName: FORMER_MEMBER_NAME,
        lastName: "",
        phone: null,
        phoneVerifiedAt: null,
        passwordHash: null,
        avatarUrl: null,
        themeId: null,
        locale: null,
        region: null,
        emailVerifiedAt: null,
        trialStartedAt: null,
        trialEndsAt: null,
      },
    });
  });

  await deleteFiles(toRemove);
}
