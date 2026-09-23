import type { PhoneCodePurpose } from "@kidcom/db";

import { config } from "../config";
import { prisma } from "../db";
import { ApiError } from "../middleware/errorHandler";
import { smsSender } from "./smsSender";
import { generateTwoFactorCode, hashTwoFactorCode } from "./twoFactor";

export const PHONE_CODE_TTL_MS = 1000 * 60 * 10; // 10 minutes
export const PHONE_CODE_MAX_ATTEMPTS = 5;
export const PHONE_CODE_RESEND_COOLDOWN_MS = 1000 * 30;

/** International format: "+" then 8–15 digits, no leading zero country code. */
export function isE164(phone: unknown): phone is string {
  return typeof phone === "string" && /^\+[1-9]\d{7,14}$/.test(phone);
}

function smsText(purpose: PhoneCodePurpose, code: string): string {
  const minutes = PHONE_CODE_TTL_MS / 60_000;
  const intro =
    purpose === "PASSWORD_RESET"
      ? `KidCom: ${code} is your password reset code.`
      : `KidCom: ${code} is your verification code.`;
  // Last line: the WebOTP / iOS domain-bound format, so the phone offers to
  // fill the code into the KidCom page (and only that page) automatically.
  const host = new URL(config.webBaseUrl).host;
  return `${intro} It expires in ${minutes} minutes. Never share it with anyone.\n\n@${host} #${code}`;
}

/**
 * Sends a fresh 6-digit code to `phone`, replacing any earlier code for the
 * same purpose. Throttled per user and purpose so the endpoint can't be used
 * to spam a number (or burn SMS credits).
 */
export async function sendPhoneCode(userId: string, phone: string, purpose: PhoneCodePurpose): Promise<void> {
  const latest = await prisma.phoneVerificationCode.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < PHONE_CODE_RESEND_COOLDOWN_MS) {
    throw new ApiError(429, "Please wait a moment before requesting another code", "CODE_COOLDOWN");
  }

  const code = generateTwoFactorCode();
  await prisma.$transaction([
    prisma.phoneVerificationCode.deleteMany({ where: { userId, purpose } }),
    prisma.phoneVerificationCode.create({
      data: {
        userId,
        purpose,
        phone,
        codeHash: hashTwoFactorCode(code),
        expiresAt: new Date(Date.now() + PHONE_CODE_TTL_MS),
      },
    }),
  ]);
  await smsSender.send({ to: phone, content: smsText(purpose, code) });
}

/** The number a pending VERIFY_PHONE code was sent to, if any. */
export async function pendingPhone(userId: string): Promise<string | null> {
  const latest = await prisma.phoneVerificationCode.findFirst({
    where: { userId, purpose: "VERIFY_PHONE" },
    orderBy: { createdAt: "desc" },
  });
  return latest?.phone ?? null;
}

/**
 * Checks `code` against the user's latest code for `purpose`. On success the
 * code is consumed and the number it was sent to is returned. Wrong codes
 * count toward a small attempt cap; hitting it or expiry requires a new code.
 */
export async function consumePhoneCode(userId: string, purpose: PhoneCodePurpose, code: string): Promise<string> {
  const record = await prisma.phoneVerificationCode.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.expiresAt < new Date()) {
    throw new ApiError(400, "This code has expired — request a new one", "CODE_EXPIRED");
  }
  if (record.codeHash !== hashTwoFactorCode(code.trim())) {
    const attempts = record.attempts + 1;
    if (attempts >= PHONE_CODE_MAX_ATTEMPTS) {
      await prisma.phoneVerificationCode.delete({ where: { id: record.id } });
      throw new ApiError(400, "Too many incorrect attempts — request a new code", "CODE_ATTEMPTS_EXCEEDED");
    }
    await prisma.phoneVerificationCode.update({ where: { id: record.id }, data: { attempts } });
    throw new ApiError(401, "Incorrect code", "CODE_INCORRECT");
  }
  await prisma.phoneVerificationCode.delete({ where: { id: record.id } });
  return record.phone;
}
