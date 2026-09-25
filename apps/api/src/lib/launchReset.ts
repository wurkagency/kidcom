// D8 launch reset — see src/scripts/resetForLaunch.ts for how to run it.
import { prisma } from "../db";
import { mediaStorage } from "./mediaStorage";
import * as quickpay from "./quickpay";

type Fk = { table: string; column: string; refTable: string; nullable: boolean; onDelete: string };

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function foreignKeys(): Promise<Fk[]> {
  return prisma.$queryRawUnsafe<Fk[]>(`
    SELECT cl.relname AS "table", att.attname AS "column", rcl.relname AS "refTable",
           NOT att.attnotnull AS nullable, con.confdeltype AS "onDelete"
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_class rcl ON rcl.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f' AND ns.nspname = 'public' AND array_length(con.conkey, 1) = 1`);
}

/**
 * Deletes the rows of `table` matching `where` (a SQL condition on the
 * table's own columns). Rows elsewhere that point at them without ON DELETE
 * CASCADE / SET NULL are cleared (nullable) or deleted first (required).
 */
async function purge(tx: typeof prisma, fks: Fk[], table: string, where: string, depth = 0): Promise<number> {
  if (depth > 12) throw new Error(`Reference chain too deep at ${table}`);
  const ids = `SELECT "id" FROM ${q(table)} WHERE ${where}`;
  for (const fk of fks.filter((f) => f.refTable === table && (f.onDelete === "a" || f.onDelete === "r"))) {
    if (fk.table === table) continue;
    const cond = `${q(fk.column)} IN (${ids})`;
    if (fk.nullable) await tx.$executeRawUnsafe(`UPDATE ${q(fk.table)} SET ${q(fk.column)} = NULL WHERE ${cond}`);
    else await purge(tx, fks, fk.table, cond, depth + 1);
  }
  return tx.$executeRawUnsafe(`DELETE FROM ${q(table)} WHERE ${where}`);
}

export type LaunchResetReport = { users: number; children: number; media: number; quickpaySubscriptions: number; done: boolean };

/** D8: removes every user except `keepEmail`, and their data. Dry run unless `confirm`. */
export async function resetForLaunch({ keepEmail, confirm, log = () => undefined }: { keepEmail: string; confirm: boolean; log?: (line: string) => void }): Promise<LaunchResetReport> {
  const keep = await prisma.user.findUnique({ where: { email: keepEmail.toLowerCase() } });
  if (!keep) throw new Error(`No account for ${keepEmail} — nothing done.`);
  const keepId = keep.id.replace(/'/g, "''");

  // Children the kept account has nothing to do with go; its own stay.
  const childWhere = `"id" NOT IN (SELECT "childId" FROM "child_access" WHERE "userId" = '${keepId}'
                                   UNION SELECT "childId" FROM "suspended_child_access" WHERE "userId" = '${keepId}')`;
  const userWhere = `"id" <> '${keepId}'`;
  const [users, children, subs, media] = await Promise.all([
    prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "users" WHERE ${userWhere}`),
    prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "children" WHERE ${childWhere}`),
    prisma.subscription.findMany({ where: { ownerId: { not: keep.id }, quickpaySubscriptionId: { not: null } } }),
    prisma.$queryRawUnsafe<{ originalPath: string; derivedPath: string | null; playablePath: string | null; sharedOriginalPath: string | null }[]>(
      `SELECT "originalPath", "derivedPath", "playablePath", "sharedOriginalPath" FROM "media_assets" WHERE "ownerId" <> '${keepId}'`
    ),
  ]);
  const report = {
    users: Number(users[0].n),
    children: Number(children[0].n),
    media: media.length,
    quickpaySubscriptions: subs.length,
    done: false,
  };
  log(
    `${confirm ? "" : "[dry run] "}Keeping ${keepEmail}. Removing ${users[0].n} user(s), ${children[0].n} child(ren), ` +
      `${media.length} media file(s); cancelling ${subs.length} QuickPay subscription(s).`
  );
  if (!confirm) {
    log("Nothing changed. Run again with --confirm to do it (after a backup).");
    return report;
  }

  for (const s of subs) {
    try {
      await quickpay.cancelSubscription(Number(s.quickpaySubscriptionId));
    } catch (err) {
      log(`QuickPay cancel failed for subscription ${s.id} — check it in the QuickPay manager: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const fks = await foreignKeys();
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);
      await purge(tx as typeof prisma, fks, "children", childWhere);
      await purge(tx as typeof prisma, fks, "users", userWhere);
      await tx.$executeRawUnsafe(`DELETE FROM "coupon_redemptions" WHERE "userId" <> '${keepId}'`);
    },
    { timeout: 10 * 60_000 }
  );

  for (const m of media) {
    for (const key of [m.originalPath, m.derivedPath, m.playablePath, m.sharedOriginalPath]) {
      if (key) await mediaStorage.delete(key).catch(() => undefined);
    }
  }

  // The kept account's children all go into its Circle (a lifetime coupon or
  // plan can be given afterwards; until then they're on its Single).
  log(`Done. Remaining users: ${await prisma.user.count()} — children: ${await prisma.child.count()}`);
  return { ...report, done: true };
}

