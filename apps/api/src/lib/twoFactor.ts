import crypto from "node:crypto";
import type { Request } from "express";
import { UAParser } from "ua-parser-js";
import geoip from "geoip-lite";

import { prisma } from "../db";
import { mailSender } from "./mailSender";
import { renderLoginTwoFactorHtml } from "./emailTemplates/loginTwoFactor";

export const TWO_FACTOR_CODE_TTL_MS = 1000 * 60 * 10; // 10 minutes
export const TWO_FACTOR_MAX_ATTEMPTS = 5;

export function generateTwoFactorCode(): string {
  // 6 random digits, zero-padded — crypto.randomInt is uniform, unlike
  // Math.random(), which matters since this is a security code.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashTwoFactorCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// Best-effort "Safari on iPhone (iOS 17.4)"-style summary from the raw
// User-Agent header. Never fabricated — an unparseable/missing UA just
// yields "Unknown device" rather than guessing.
function describeDevice(userAgent: string | undefined): string {
  if (!userAgent) return "Unknown device";
  const { browser, os } = new UAParser(userAgent).getResult();
  const browserName = browser.name ?? "Unknown browser";
  const osName = os.name ?? "Unknown OS";
  const osVersion = os.version ? ` ${os.version}` : "";
  return `${browserName} on ${osName}${osVersion}`.trim();
}

// Best-effort city/country from the caller's IP via an offline MaxMind-lite
// database (geoip-lite) — no external API call or key. In local dev the
// caller's IP is always loopback/private, which never resolves to anything,
// so this deliberately says so rather than ever showing a fabricated city;
// behind a real reverse proxy in production (with `trust proxy` configured)
// req.ip carries the real forwarded client IP and this starts resolving real
// approximate locations.
function describeLocation(ip: string | undefined): string {
  if (!ip) return "Location unavailable";
  const normalized = ip.replace(/^::ffff:/, "");
  const lookup = geoip.lookup(normalized);
  if (!lookup) return "Location unavailable";
  const parts = [lookup.city, lookup.country].filter(Boolean);
  if (parts.length === 0) return "Location unavailable";
  return `${parts.join(", ")} (Approximate)`;
}

// Creates a fresh login OTP for `user` (replacing any existing one, same
// "one active row" pattern as EmailVerificationToken) and emails it with the
// real request's device/location/time context. Used by both POST /login (the
// initial send) and POST /auth/resend-2fa (a re-send for the same pending
// login).
export async function sendLoginTwoFactorCode(user: { id: string; email: string }, req: Request) {
  const code = generateTwoFactorCode();
  await prisma.$transaction([
    prisma.loginTwoFactorCode.deleteMany({ where: { userId: user.id } }),
    prisma.loginTwoFactorCode.create({
      data: {
        userId: user.id,
        codeHash: hashTwoFactorCode(code),
        expiresAt: new Date(Date.now() + TWO_FACTOR_CODE_TTL_MS),
      },
    }),
  ]);

  const device = describeDevice(req.headers["user-agent"]);
  const location = describeLocation(req.ip);
  const time = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const ttlMinutes = TWO_FACTOR_CODE_TTL_MS / (1000 * 60);

  await mailSender.send({
    to: user.email,
    subject: "Your KidCom verification code",
    text: `Your KidCom login verification code is ${code}. It's valid for ${ttlMinutes} minutes.\n\nLogin attempt details:\nDevice: ${device}\nLocation: ${location}\nTime: ${time}\n\nIf you didn't request this code, change your password immediately or contact support@kidcom.org.`,
    html: renderLoginTwoFactorHtml({
      email: user.email,
      code,
      ttlMinutes,
      device,
      location,
      time,
    }),
  });
}
