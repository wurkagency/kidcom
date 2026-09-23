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
  // notes); in production it's api.kidcom.org per docs/plesk_deployment.md.
  apiBaseUrl: process.env.API_BASE_URL ?? `http://localhost:${port}`,
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  sessionSecret: required("SESSION_SECRET", "dev-only-secret-change-me"),
  // Post-launch backlog Phase G — GDPR Art. 9 special-category data about a
  // minor (MedicalInfo.condition/description/emergencyNote), encrypted at
  // rest at the app layer. Same "required with a dev-only fallback" shape
  // as sessionSecret above: production must set a real one (generate with
  // `openssl rand -hex 32`, same as SESSION_SECRET), local dev works out of
  // the box. Any-length input is fine — lib/medicalEncryption.ts derives a
  // real 32-byte AES-256 key from whatever string this is via SHA-256, so
  // this doesn't need to be exactly 32 bytes itself.
  medicalInfoEncryptionKey: required("MEDICAL_INFO_ENCRYPTION_KEY", "dev-only-medical-encryption-key-change-me"),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
  cookieDomain: process.env.COOKIE_DOMAIN ?? "localhost",
  mediaStoragePath: process.env.MEDIA_STORAGE_PATH ?? "./media",
  // v3.0: every media file is encrypted at rest (lib/mediaCrypto.ts) with a
  // per-file key wrapped by this 32-byte master key (`openssl rand -hex 32`).
  // LOSING IT MAKES EVERY PHOTO AND VIDEO UNRECOVERABLE — back it up apart
  // from the media and the database (docs/plesk_deployment.md). Production
  // refuses to start without one; local dev/test fall back to a fixed,
  // public dev key. MEDIA_ENCRYPTION_KEYS_PREVIOUS (comma-separated) keeps
  // old keys readable during a rotation.
  mediaEncryptionKey:
    process.env.MEDIA_ENCRYPTION_KEY ??
    (process.env.NODE_ENV === "production"
      ? required("MEDIA_ENCRYPTION_KEY")
      : "d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0"),
  mediaEncryptionKeysPrevious: (process.env.MEDIA_ENCRYPTION_KEYS_PREVIOUS ?? "").split(",").map((k) => k.trim()).filter(Boolean),
  // Plaintext scratch space while the worker runs sharp/ffmpeg; files are
  // 0600 and removed as soon as each step finishes.
  mediaTempPath: process.env.MEDIA_TEMP_PATH,
  isProduction: process.env.NODE_ENV === "production",
  // Temporary testing toggle for the still-in-testing production deployment:
  // when true, POST /billing/subscribe skips QuickPay entirely and activates
  // whatever tier was requested directly (same bypass local dev already
  // gets — see routes/billing/index.ts), letting any user switch freely
  // between Free/Parents/Family without a real charge. Off by default, so a
  // real production launch just needs this env var removed/unset — no code
  // change — to require real QuickPay checkout again.
  billingTestMode: process.env.BILLING_TEST_MODE === "true",
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
  // delivery in production, per docs/plesk_deployment.md.
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  // Must be a sender verified in Brevo (no-reply@kidcom.org is).
  smtpFrom: process.env.SMTP_FROM ?? '"KidCom" <no-reply@kidcom.org>',
  // SMS (lib/smsSender.ts). "brevo" sends real SMS; "log" prints them. Real
  // SMS costs credits, so only production sends by default.
  smsDelivery: (process.env.SMS_DELIVERY ?? (process.env.NODE_ENV === "production" ? "brevo" : "log")) as "brevo" | "log",
  brevoApiKey: process.env.BREVO_API_KEY,
  brevoSmsSender: process.env.BREVO_SMS_SENDER ?? "KidCom",
  // Google/Microsoft sign-in (lib/oauth.ts). The redirect base is the public
  // origin the browser reaches the API through: the web origin + "/api"
  // (Vite proxy in dev, the same path routing in production), so the OAuth
  // callback lands same-origin with the app and the session cookie.
  oauthRedirectBase: process.env.OAUTH_REDIRECT_BASE ?? "http://localhost:5173/api",
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID ?? "common",
  // The web app's own base URL — used to build links that go out in email
  // (verification, invites). The first CORS origin is always the web app's
  // real origin (see corsOrigin above), so it doubles as this without a
  // separate env var to keep in sync.
  webBaseUrl: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",")[0],
};
