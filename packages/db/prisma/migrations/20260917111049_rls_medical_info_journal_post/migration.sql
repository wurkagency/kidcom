-- v2.0 RLS pilot (plan §3.2). A second, independent, database-enforced
-- authorization layer under the existing requireChildAccess/entitlement
-- app-layer middleware — that middleware is NOT removed or weakened.
--
-- current_user_id is delivered per-query via
-- `SELECT set_config('app.current_user_id', $1, true)` inside the SAME
-- transaction as the query it gates (see apps/api/src/lib/rls.ts's
-- withRls()) — `true` makes it a LOCAL setting, scoped to that one
-- transaction, so it can never leak across this app's pooled connections.
-- `current_setting(..., true)` (missing_ok=true) returns '' rather than
-- erroring when unset, so any query that reaches these tables outside of
-- withRls()/withRlsBypass() is denied by the policy rather than crashing.
--
-- Every predicate below also OR's in
-- `current_setting('app.bypass_rls', true) = 'on'` — a narrow, explicit
-- escape hatch (see apps/api/src/lib/rls.ts's bypassRls(), mirroring
-- Prisma's own documented bypassRLS() recipe) for the one operation that
-- doesn't map onto "the current user has ChildAccess to this row":
-- claimMerge.ts's duplicate-child reconciliation, which reassigns OTHER
-- members' content onto a record the accepting user was never meant to
-- hold ChildAccess to themselves. Never set except by that already-verified
-- operation.
--
-- FORCE ROW LEVEL SECURITY: the connecting app role (kidcom_appuser in dev,
-- matching Plesk's non-superuser DB-user provisioning in production per
-- DEPLOYMENT.md) is also the OWNER of these tables (it's the role that ran
-- `prisma migrate deploy`). Postgres exempts a table's owner from its own
-- RLS policies unless FORCE is set — without it, the app's own queries
-- would silently bypass RLS entirely, which would defeat the whole point
-- of this branch. (A true Postgres superuser bypasses RLS unconditionally
-- regardless of FORCE — confirmed locally: the "splitkid" bootstrap role
-- ignores RLS even with FORCE set, which is why local dev now runs the app
-- as "kidcom_appuser", a real non-superuser role, instead.)

-- ---------------------------------------------------------------------------
-- medical_info — direct childId, single predicate covers reads and writes.
-- ---------------------------------------------------------------------------
ALTER TABLE "medical_info" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medical_info" FORCE ROW LEVEL SECURITY;

CREATE POLICY "medical_info_rls" ON "medical_info"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "child_access"
      WHERE "child_access"."childId" = "medical_info"."childId"
        AND "child_access"."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "child_access"
      WHERE "child_access"."childId" = "medical_info"."childId"
        AND "child_access"."userId" = current_setting('app.current_user_id', true)
    )
  );

-- ---------------------------------------------------------------------------
-- journal_post_children — the child-tagging join table. Protected in this
-- same migration (not deferred to the Phase 5 rollout) because
-- journal_posts' own policy below reads through it — leaving it unprotected
-- would make journal_posts' policy the only real gate, and any direct query
-- against journal_post_children itself would stay wide open.
-- ---------------------------------------------------------------------------
ALTER TABLE "journal_post_children" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_post_children" FORCE ROW LEVEL SECURITY;

CREATE POLICY "journal_post_children_rls" ON "journal_post_children"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "child_access"
      WHERE "child_access"."childId" = "journal_post_children"."childId"
        AND "child_access"."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "child_access"
      WHERE "child_access"."childId" = "journal_post_children"."childId"
        AND "child_access"."userId" = current_setting('app.current_user_id', true)
    )
  );

-- ---------------------------------------------------------------------------
-- journal_posts — no direct childId (scopes via journal_post_children, a
-- many-to-many join). apps/api/src/routes/children/journal.ts's POST /
-- handler creates the journal_posts row FIRST, then the
-- journal_post_children link rows, in the same transaction — and Prisma's
-- `.create()` always does INSERT ... RETURNING, which Postgres subjects to
-- the table's read (USING) policy, not just WITH CHECK. A tagged-child-only
-- USING would reject the RETURNING on that very first insert, since no
-- linkage exists yet at that exact statement (confirmed by reproducing it
-- directly: the plain INSERT succeeds, only the RETURNING fails).
--
-- The "author AND not yet tagged to any child" clause below exists only to
-- let that one just-inserted, not-yet-linked row be read back in the same
-- transaction. It is not a standing "authors can always read their own
-- posts" exception: the moment journal_post_children rows exist for a post
-- (immediately after, in the same transaction, and for its entire life
-- after that), this clause goes false and the tagged-child check is the
-- only thing that can grant access — including to the original author, if
-- they've since lost access to every tagged child. No exception survives
-- past the transaction that created the row.
-- ---------------------------------------------------------------------------
ALTER TABLE "journal_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_posts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "journal_posts_rls" ON "journal_posts"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      "authorId" = current_setting('app.current_user_id', true)
      AND NOT EXISTS (SELECT 1 FROM "journal_post_children" WHERE "journalPostId" = "journal_posts"."id")
    )
    OR EXISTS (
      SELECT 1 FROM "journal_post_children" jpc
      JOIN "child_access" ca ON ca."childId" = jpc."childId"
      WHERE jpc."journalPostId" = "journal_posts"."id"
        AND ca."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      "authorId" = current_setting('app.current_user_id', true)
      AND NOT EXISTS (SELECT 1 FROM "journal_post_children" WHERE "journalPostId" = "journal_posts"."id")
    )
    OR EXISTS (
      SELECT 1 FROM "journal_post_children" jpc
      JOIN "child_access" ca ON ca."childId" = jpc."childId"
      WHERE jpc."journalPostId" = "journal_posts"."id"
        AND ca."userId" = current_setting('app.current_user_id', true)
    )
  );
