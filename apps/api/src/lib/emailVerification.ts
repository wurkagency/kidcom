import crypto from "node:crypto";

import { prisma } from "../db";
import { config } from "../config";
import { mailSender } from "./mailSender";
import { renderConfirmEmailHtml } from "./emailTemplates/confirmEmail";

const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const VERIFICATION_TOKEN_TTL_HOURS = VERIFICATION_TOKEN_TTL_MS / (1000 * 60 * 60);

export function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Creates a fresh verification token for a user (replacing any existing one,
// same "one active row" pattern as CustodyPlan) and emails the link. Used by
// every account-creation path — organic signup (routes/auth/index.ts) and
// invite-accept (routes/invites/index.ts) — so a new account is always
// unverified until this same proof-of-inbox step succeeds, regardless of how
// it was created.
export async function sendVerificationEmail(user: { id: string; email: string; firstName: string }) {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashVerificationToken(token),
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      },
    }),
  ]);

  const link = `${config.webBaseUrl}/verify-email?token=${token}`;
  await mailSender.send({
    to: user.email,
    subject: "Verify your email for SplitKid",
    text: `Hi ${user.firstName},\n\nPlease confirm this is your email address to finish setting up your SplitKid account:\n\n${link}\n\nThis link expires in ${VERIFICATION_TOKEN_TTL_HOURS} hours. If you didn't create a SplitKid account, you can ignore this email.`,
    html: renderConfirmEmailHtml({
      email: user.email,
      confirmUrl: link,
      ttlHours: VERIFICATION_TOKEN_TTL_HOURS,
    }),
  });
}
