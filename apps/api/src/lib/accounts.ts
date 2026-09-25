import { prisma } from "../db";

// I-2 (spec §2.2/§4.3): one 30-day trial per user, granted at account creation.

/**
 * Creates a new account the way every signup path does (email form or
 * Google/Microsoft): Free tier subscription (ACTIVE, no subscription-level
 * trial — spec §4.1's permanent Free tier) plus the user's own one-time
 * 30-day trial, and a recorded terms acceptance.
 */
export async function createAccount(data: {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash?: string | null;
  emailVerified?: boolean;
  oauth?: { provider: "GOOGLE" | "MICROSOFT"; providerUserId: string; email: string | null };
}) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash: data.passwordHash ?? null,
        emailVerifiedAt: data.emailVerified ? now : null,
        termsAcceptedAt: now,
        ...(data.oauth ? { oauthAccounts: { create: data.oauth } } : {}),
      },
    });
    await tx.subscription.create({
      data: { ownerId: user.id, tier: "FREE", status: "ACTIVE", trialEndsAt: null },
    });
    return user;
  });
}
