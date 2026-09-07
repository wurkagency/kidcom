// In local dev, the root `npm run dev:api` script loads the root `.env` via
// `dotenv-cli` before this process even starts, so process.env is already
// populated by the time this import runs. This `dotenv/config` call is just
// a fallback for running `apps/api` directly (e.g. `cd apps/api && npm run
// dev`) — it looks for a `.env` in this folder and no-ops harmlessly if one
// isn't there. In production (Plesk), env vars are set directly in the
// Node.js app panel, so this is a no-op there too.
import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const port = Number(process.env.PORT ?? 4000);

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port,
  // The API's own publicly reachable base URL — used to build the QuickPay
  // webhook callback URL. In local dev this is localhost, which QuickPay
  // can't reach directly (needs a tunnel like ngrok — see chunk 7 plan
  // notes); in production it's api.kidcom.org per DEPLOYMENT.md.
  apiBaseUrl: process.env.API_BASE_URL ?? `http://localhost:${port}`,
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  sessionSecret: required("SESSION_SECRET", "dev-only-secret-change-me"),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
  cookieDomain: process.env.COOKIE_DOMAIN ?? "localhost",
  mediaStoragePath: process.env.MEDIA_STORAGE_PATH ?? "./media",
  isProduction: process.env.NODE_ENV === "production",
  // Optional — billing routes fail with a clear 500 if unset rather than
  // crashing boot, so the rest of the app still runs without QuickPay keys
  // in local dev (see chunk 7 plan notes).
  quickpayApiKey: process.env.QUICKPAY_API_KEY,
  quickpayPrivateKey: process.env.QUICKPAY_PRIVATE_KEY,
  quickpayBaseUrl: process.env.QUICKPAY_BASE_URL ?? "https://api.quickpay.net",
  // Optional — same "fails clearly at send-time, not at boot" treatment as
  // the QuickPay keys. Generate a pair with `npx web-push generate-vapid-keys`.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:charlie@wurk.dk",
  // SMTP — optional. Unset in local dev (mailSender.ts falls back to
  // logging emails to the console instead of sending them); set for real
  // delivery in production, per DEPLOYMENT.md.
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  smtpFrom: process.env.SMTP_FROM ?? '"KidCom" <noreply@kidcom.org>',
  // The web app's own base URL — used to build links that go out in email
  // (verification, invites). The first CORS origin is always the web app's
  // real origin (see corsOrigin above), so it doubles as this without a
  // separate env var to keep in sync.
  webBaseUrl: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",")[0],
};
