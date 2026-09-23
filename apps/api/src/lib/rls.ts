import { Prisma } from "@kidcom/db";

import { prisma } from "../db";

// Row-Level Security (v2.0 tenant isolation, plan §3.2). PostgreSQL RLS
// policies on child-scoped tables key off current_setting('app.current_user_id').
// That value must be pushed via SET LOCAL inside the SAME transaction as the
// query it's meant to gate — a bare SET (or setting it on one pooled
// connection and querying on another) leaks one user's context into
// another's request, since Postgres connections are reused across requests
// under this app's single-process, non-pgbouncer deployment.
//
// Every call site that touches an RLS-protected table MUST go through this
// helper instead of calling `prisma.<model>` directly. It's deliberately
// explicit rather than an auto-wrapping Prisma Client Extension: Prisma's
// own client-extensions example
// (https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security)
// wraps every top-level `prisma.model.op()` call in its own
// `$transaction([setConfig, query])`, which works for simple single-call
// sites — but this codebase already has several existing
// `prisma.$transaction(async (tx) => { ...multiple ops... })` call sites
// (auth profile update, avatar swap, invite accept) built for their own
// atomicity, and Prisma has a documented gap where extensions do NOT
// propagate into the `tx` handed to an interactive transaction's callback
// (https://github.com/prisma/prisma/issues/17948) — an auto-wrapping
// extension would silently never run for exactly those handlers. Being
// explicit here means every RLS-relevant query is visibly, deliberately
// routed through the same GUC-setting transaction, with nothing relying on
// extension-propagation behavior Prisma itself calls out as surprising.
export async function withRls<T>(userId: string, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return run(tx);
  });
}

// System-level escape hatch for operations that are already fully
// authorized by application logic but don't map onto "the current user has
// ChildAccess to this row" — e.g. claimMerge.ts's duplicate-child
// reconciliation, which reassigns OTHER members' moments/medical/etc.
// content onto a record the accepting user was never meant to hold
// ChildAccess to themselves (that's the whole point of the merge). Mirrors
// Prisma's own documented bypassRLS() client-extension recipe
// (https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security).
// Every RLS policy this affects OR's in
// `current_setting('app.bypass_rls', true) = 'on'`. Call this on a `tx`
// whose legitimacy was already verified by the caller (never as a shortcut
// around a missing app-layer check), before the operation that needs it.
export async function bypassRls(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
}

// Same bypass, but opening its own transaction — for trusted system-level
// callers with no per-request user at all (worker.ts's BullMQ jobs: media
// processing status updates, the cross-user appointment-reminder scan).
// Never call this from a request handler acting on a user's behalf; use
// withRls() there instead.
export async function withRlsBypass<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await bypassRls(tx);
    return run(tx);
  });
}
