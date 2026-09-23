import path from "node:path";
import dotenv from "dotenv";

// Runs once, before any test file's imports, as a vitest `setupFiles` entry.
// Loads the same root `.env` dev config normally would (dotenv-cli isn't in
// play under vitest), then redirects DATABASE_URL at a sibling "_test"
// database on the same Postgres server/credentials — never the real dev
// database, which holds Charlie's own manually-created test data. Swapping
// the db name out of whatever DATABASE_URL is already configured (rather
// than hardcoding a user/pass here) keeps this working regardless of which
// local credentials a given machine's .env uses.
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error("DATABASE_URL must be set (via root .env) before running apps/api tests");
}

const testUrl = baseUrl.replace(/\/([^/?]+)(\?.*)?$/, (_match, dbName: string, query = "") => `/${dbName}_test${query}`);
if (testUrl === baseUrl) {
  throw new Error(`Could not derive a "_test" database name from DATABASE_URL: ${baseUrl}`);
}

process.env.DATABASE_URL = testUrl;

// Same isolation idea for session storage: sessions live in Redis
// (middleware/session.ts), keyed by random session id under a shared
// "kidcom:sess:" prefix — reusing dev's logical DB 0 would slowly
// accumulate test-created session keys there. Redis ships 16 logical DBs
// per server; route tests at DB 1 instead of a separate prefix scheme.
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.REDIS_URL = redisUrl.replace(/\/\d*$/, "").replace(/^(redis:\/\/[^/]+).*$/, "$1") + "/1";

process.env.NODE_ENV = "test";
// Tests write media too: keep it out of dev's media folder, under a fixed key.
process.env.MEDIA_STORAGE_PATH = path.resolve(__dirname, "../../media-test");
process.env.MEDIA_ENCRYPTION_KEY = "7e57".repeat(16);
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret";
// Never reach the real payment provider from tests; billing tests stub lib/quickpay.
delete process.env.QUICKPAY_API_KEY;
delete process.env.QUICKPAY_PRIVATE_KEY;
