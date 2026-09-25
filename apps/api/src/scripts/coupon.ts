// Coupons (subscription model). Run with the API's environment, e.g.
//
//   npx dotenv -e apps/api/.env -- npm run coupon --workspace=apps/api -- create --tier FAMILY --max 25 --note "Internal testing and family"
//   npx dotenv -e apps/api/.env -- npm run coupon --workspace=apps/api -- list
//   npx dotenv -e apps/api/.env -- npm run coupon --workspace=apps/api -- deactivate KC-ABCD-EFGH
//
// "create" makes a lifetime coupon: redeeming it (Plan & billing → "Have a
// code?") gives that person's Circle the coupon's tier for good, with no
// card and no renewals. The code is printed once — keep it somewhere safe,
// it isn't shown again in full. --code sets your own code instead of a
// random one; --max limits how many people can redeem it (default: no limit).
/* eslint-disable no-console */
import crypto from "node:crypto";
import type { SubscriptionTier } from "@kidcom/db";

import { prisma } from "../db";
import { normalizeCouponCode } from "../lib/coupons";

// No 0/O/1/I/L: easy to read out loud and type on a phone.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function randomCode(): string {
  const chars = Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `KC-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const mask = (code: string) => `${code.slice(0, 4)}…${code.slice(-2)}`;

async function main() {
  const command = process.argv[2];
  if (command === "create") {
    const tier = (arg("tier") ?? "FAMILY").toUpperCase() as SubscriptionTier;
    if (tier !== "PARENTS" && tier !== "FAMILY") throw new Error("--tier must be PARENTS or FAMILY");
    const max = arg("max") ? Number(arg("max")) : null;
    if (max !== null && (!Number.isInteger(max) || max < 1)) throw new Error("--max must be a positive whole number");
    const code = normalizeCouponCode(arg("code") ?? randomCode());
    const coupon = await prisma.coupon.create({ data: { code, tier, lifetime: true, maxRedemptions: max, note: arg("note") ?? null } });
    console.log(`Created a lifetime ${tier} coupon (${max ?? "unlimited"} redemptions):\n\n  ${coupon.code}\n`);
    return;
  }
  if (command === "list") {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "asc" } });
    for (const c of coupons) {
      console.log(
        `${mask(c.code)}  ${c.tier}  ${c.active ? "active" : "inactive"}  ${c.redemptionCount}/${c.maxRedemptions ?? "∞"} used  ${c.note ?? ""}`
      );
    }
    if (coupons.length === 0) console.log("No coupons.");
    return;
  }
  if (command === "deactivate") {
    const code = normalizeCouponCode(process.argv[3] ?? "");
    const { count } = await prisma.coupon.updateMany({ where: { code }, data: { active: false } });
    console.log(count ? "Deactivated. Circles already on it keep their plan." : "No coupon with that code.");
    return;
  }
  console.log("Usage: coupon create --tier FAMILY|PARENTS [--max N] [--note TEXT] [--code CODE] | list | deactivate CODE");
  process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
