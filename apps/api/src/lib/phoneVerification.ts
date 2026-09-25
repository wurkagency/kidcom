import type { PhoneCodePurpose } from "@kinnd/db";
import { isE164, isSupportedPhone } from "@kinnd/shared";

import { config } from "../config";
import { prisma } from "../db";
import { ApiError } from "../middleware/errorHandler";
import { smsSender } from "./smsSender";
import { generateTwoFactorCode, hashTwoFactorCode } from "./twoFactor";

export const PHONE_CODE_TTL_MS = 1000 * 60 * 10; // 10 minutes
export const PHONE_CODE_MAX_ATTEMPTS = 5;
export const PHONE_CODE_RESEND_COOLDOWN_MS = 1000 * 30;
// Toll-fraud guard: texts to one number in any 24 hours, across all accounts
// (a real person needs 1–3: sign-up, a resend, a password reset).
export const SMS_PER_NUMBER_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A number we may text: well-formed and in a country the app offers, outside
 * the premium/foreign ranges (@kinnd/shared phone.ts). Checked before any
 * account is created, and again right before every SMS.
 */
export function assertPhoneAllowed(phone: unknown): asserts phone is string {
  if (!isE164(phone)) throw new ApiError(400, "Please enter a valid mobile number", "PHONE_INVALID");
  if (!isSupportedPhone(phone)) {
    throw new ApiError(400, "Kinnd can't send text messages to this number's country yet", "PHONE_COUNTRY_UNSUPPORTED");
  }
}

/**
 * The two caps that bound what SMS pumping can cost: per destination number
 * (stops hammering one premium number from many throwaway accounts) and in
 * total (a hard ceiling on spend; reaching it pauses SMS and logs an alert).
 */
export async function assertSmsQuota(phone: string): Promise<void> {
  const since = new Date(Date.now() - DAY_MS);
  const [toNumber, total] = await Promise.all([
    prisma.smsSend.count({ where: { phone, createdAt: { gte: since } } }),
    prisma.smsSend.count({ where: { createdAt: { gte: since } } }),
  ]);
  if (total >= config.smsDailyLimit) {
    // eslint-disable-next-line no-console
    console.error(
      `[ALERT] SMS daily limit reached: ${total} sent in 24 h (SMS_DAILY_LIMIT=${config.smsDailyLimit}). ` +
        "SMS is paused. Check sms_sends for pumping before raising the limit."
    );
    throw new ApiError(503, "Text messages are paused for a moment — please try again later", "SMS_UNAVAILABLE");
  }
  if (toNumber >= SMS_PER_NUMBER_PER_DAY) {
    throw new ApiError(429, "Too many codes were sent to this number today — please try again tomorrow", "SMS_LIMIT");
  }
}

function smsText(purpose: PhoneCodePurpose, code: string): string {
  const minutes = PHONE_CODE_TTL_MS / 60_000;
  const intro =
    purpose === "PASSWORD_RESET"
      ? `Kinnd: ${code} is your password reset code.`
      : `Kinnd: ${code} is your verification code.`;
  // Last line: the WebOTP / iOS domain-bound format, so the phone offers to
  // fill the code into the Kinnd page (and only that page) automatically.
  const host = new URL(config.webBaseUrl).host;
  return `${intro} It expires in ${minutes} minutes. Never share it with anyone.\n\n@${host} #${code}`;
}

/**
 * Sends a fresh 6-digit code to `phone`, replacing any earlier code for the
 * same purpose. Every SMS in the app goes through here: the number must be
 * allowed, the user must wait between resends, and the per-number and total
 * caps must have room. Each send is logged (sms_sends) for those caps.
 */
export async function sendPhoneCode(userId: string, phone: string, purpose: PhoneCodePurpose): Promise<void> {
  assertPhoneAllowed(phone);
  const latest = await prisma.phoneVerificationCode.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < PHONE_CODE_RESEND_COOLDOWN_MS) {
    throw new ApiError(429, "Please wait a moment before requesting another code", "CODE_COOLDOWN");
  }
  await assertSmsQuota(phone);

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
    prisma.smsSend.create({ data: { userId, phone, purpose } }),
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
