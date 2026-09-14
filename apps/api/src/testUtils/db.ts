import { prisma } from "../db";
import { redis } from "../redis";

// Truncates every application table and flushes the session store between
// tests. A full truncate (rather than per-test transactions) because
// several flows under test span more than one request (e.g. invite-create
// -> invite-accept, or subscribe -> webhook) and so can't share a single
// rolled-back transaction. Safe by construction: setupEnv.ts already
// redirected DATABASE_URL at a "_test" database and REDIS_URL at a
// dedicated logical DB (1) before this module's `prisma`/`redis` imports
// could resolve a connection, so this can never touch real dev data/sessions.
export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length > 0) {
    const names = tables.map((t) => `"${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  }
  await redis.flushdb();
}
