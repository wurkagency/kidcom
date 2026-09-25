# Lessons (corrections made during the v3.0 build)

## Row-level security hides rows from anything without a user context

Child-scoped tables use `FORCE ROW LEVEL SECURITY`, which applies to the
table owner too — including `psql` sessions, one-off scripts and **Prisma
migrations**. A query with no `app.current_user_id` and no bypass flag sees
**zero rows**, silently.

- 2026-09-23 — a pre-wipe survey counted 0 moments/comments/media by test
  accounts; the delete (run with `withRlsBypass`) found 3/1/2.
- 2026-09-24 — the categories migration's `UPDATE … SET "categoryId" = …`
  matched 0 rows before the enum column was dropped; all 22 dev events lost
  their category (restored from titles). Caught before production.

**Rule:** any read or data-migration statement on a child-scoped table runs
with the bypass flag — `withRlsBypass` in code, `SET app.bypass_rls = 'on'`
in `psql`, and `SELECT set_config('app.bypass_rls', 'on', false)` … `'off'`
around the data statements of a migration. Prove data-moving migrations on a
scratch database seeded with rows **under RLS** (see the Phase 3 entry in
`tasks/todo.md`), not on the empty test database.

## Never point Prisma's shadow database at a real database (2026-09-25)
`prisma migrate diff --shadow-database-url <url>` **wipes** that database to replay migrations.
Pointing it at `kinnd_test` reset the test DB (recovered with `migrate reset` on the _test
URL). To check schema ↔ migrations, diff against the migrated test DB with `--from-url`
instead, or use a throwaway shadow database — never dev.

## Relation filters under RLS: use `is` when the parent can be hidden (2026-09-25)
`media_assets` RLS doesn't know a moment can be hidden from extended family, so an asset can
be visible while its moment isn't. `where: { moment: { is: {...} } }` makes Prisma require the
moment through a subquery that RLS also filters; a bare `moment: {}` doesn't.
