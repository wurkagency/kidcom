import crypto from "node:crypto";

import { prisma } from "../db";
import { config } from "../config";
import { mailSender } from "./mailSender";
import { renderPasswordResetHtml } from "./emailTemplates/passwordReset";

// Post-launch backlog Phase F — same shape as lib/emailVerification.ts
// throughout: hash-only storage, single-use, short-lived, delete-and-
// recreate on re-request rather than accumulating one row per request.
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1h — shorter than email
// verification's 24h: this grants a password change, a more sensitive
// action, so a tighter window is the right default.
const RESET_TOKEN_TTL_HOURS = RESET_TOKEN_TTL_MS / (1000 * 60 * 60);

export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function sendPasswordResetEmail(user: { id: string; email: string }): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  const link = `${config.webBaseUrl}/reset-password?token=${token}`;
  await mailSender.send({
    to: user.email,
    subject: "Reset your password for Kinnd",
    text: `We got a request to reset the password for ${user.email}.\n\nReset it here: ${link}\n\nThis link expires in ${RESET_TOKEN_TTL_HOURS} hour(s). If you didn't request this, you can ignore this email — your password hasn't changed.`,
    html: renderPasswordResetHtml({ email: user.email, resetUrl: link, ttlHours: RESET_TOKEN_TTL_HOURS }),
  });
}
