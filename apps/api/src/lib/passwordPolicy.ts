import bcrypt from "bcryptjs";

import { prisma } from "../db";
import { ApiError } from "../middleware/errorHandler";

export const SALT_ROUNDS = 10;
const REUSE_WINDOW_MS = 1000 * 60 * 60 * 24 * 90; // 90 days

// The rules shown on the reset/create password screen (kidcom_reset_password):
// at least 8 characters, includes a number or symbol, not used in the past
// 90 days. The client shows them live; the server is what enforces them.
export function assertStrongPassword(password: unknown): asserts password is string {
  if (typeof password !== "string" || password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters long");
  }
  if (!/[\d\W_]/.test(password)) {
    throw new ApiError(400, "Password must include a number or symbol");
  }
}

async function wasRecentlyUsed(userId: string, password: string, currentHash: string | null): Promise<boolean> {
  if (currentHash && (await bcrypt.compare(password, currentHash))) return true;
  const history = await prisma.passwordHistory.findMany({
    where: { userId, createdAt: { gte: new Date(Date.now() - REUSE_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const entry of history) {
    if (await bcrypt.compare(password, entry.passwordHash)) return true;
  }
  return false;
}

/**
 * Validates and sets a user's password, archiving the previous hash so it
 * can't be reused within 90 days.
 */
export async function setPassword(userId: string, password: unknown): Promise<void> {
  assertStrongPassword(password);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (await wasRecentlyUsed(userId, password, user.passwordHash)) {
    throw new ApiError(400, "Choose a password you haven't used in the past 90 days");
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.$transaction([
    ...(user.passwordHash
      ? [prisma.passwordHistory.create({ data: { userId, passwordHash: user.passwordHash } })]
      : []),
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.passwordHistory.deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - REUSE_WINDOW_MS) } } }),
  ]);
}
