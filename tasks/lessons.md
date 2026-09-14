# Lessons learned mid-build

## `prisma migrate dev` doesn't work in this environment — use diff + manual migration + deploy

**What happened:** Running `npm run prisma:migrate` (wraps `prisma migrate dev`) fails
with `Error: Prisma Migrate has detected that the environment is non-interactive, which
is not supported` — this Claude Code session's shell has no TTY, and `migrate dev`
hard-requires one (even with `--name` and `--create-only` flags supplied) to run at all.

**Why:** Prisma's `migrate dev` command always prompts/confirms even when flags are
given; it isn't designed for pure non-interactive use, unlike `migrate deploy`.

**Fix, for every future schema change in this session:**
1. Edit `packages/db/prisma/schema.prisma`.
2. Generate the raw SQL: `cd packages/db && DATABASE_URL="<real DATABASE_URL>" npx
   prisma migrate diff --from-url "<real DATABASE_URL>" --to-schema-datamodel
   prisma/schema.prisma --script`
3. Create a migration folder by hand:
   `prisma/migrations/<UTC timestamp YYYYMMDDHHMMSS>_<name>/migration.sql`, paste the
   generated SQL in.
4. Apply with `migrate deploy` (this one *is* non-interactive and safe to run here) —
   **twice**: once against the real dev DB (`DATABASE_URL=...splitkid`), once against
   the isolated test DB (`DATABASE_URL=...splitkid_test`) so both stay in sync and the
   test suite keeps passing.
5. Regenerate the client: `npm run prisma:generate` (root).

**How to apply this going forward:** Any phase in `tasks/todo.md` that touches
`schema.prisma` follows this exact 5-step sequence instead of `npm run prisma:migrate`.
Don't retry `migrate dev` expecting a different result — it's a hard environment
limitation, not a flaky command.

## Local dev naming: "splitkid", not "kidcom"

**What happened:** `docker-compose.yml` and `.env.example` both use `kidcom`/`kidcom`
creds and db name, but the real local `.env` (and the actual running Docker containers
— `splitkid-dev-postgres-1`, `splitkid-dev-redis-1`) use `splitkid`/`splitkid`. This is
leftover naming drift from before the app/package rename from SplitKid to KidCom
(`schema.prisma`'s header comment still says "SplitKid — initial data model").

**Why it matters:** Any command copy-pasted from `.env.example`/`docker-compose.yml`
comments (or assumed from the `kidcom` npm package names) against the real local
Postgres will fail or, worse, silently connect to the wrong thing if a `kidcom`-named
DB happens to also exist. Always read the real `.env`'s `DATABASE_URL` first, don't
assume it matches `.env.example`.

**How to apply this going forward:** `apps/api/src/testUtils/setupEnv.ts` already
derives the test DB name from whatever `DATABASE_URL` actually is (not hardcoded) for
exactly this reason. Do the same for any other tooling: derive from the real `.env`,
never hardcode `kidcom`.

## The migration history doesn't fully describe the real dev DB — use `db push` for the test DB, not `migrate deploy`

**What happened:** Phase 3 added calendar-event permission tests and they failed with
`The column 'confirmable' does not exist in the current database` against
`splitkid_test` — but `splitkid_test` had been built by replaying every migration file
in `packages/db/prisma/migrations/` via `migrate deploy` (see the lesson above), which
should be equivalent to dev. Checked the real dev DB directly
(`docker exec splitkid-dev-postgres-1 psql -U splitkid -d splitkid -c "\d
calendar_events"`) — it **does** have `confirmable`, `assignedNote`, `contactName`,
etc., none of which appear in any migration file (confirmed with `grep -r confirmable
packages/db/prisma/migrations` — no matches). So the migration history is incomplete:
at some point `schema.prisma` was changed and applied to the real dev DB (`prisma db
push`, or a migration that was later deleted) without ever being captured as a
migration file. This is pre-existing drift in the repo, not something this session's
changes caused.

**Fix:** stopped trying to keep the test DB in sync via `migrate deploy` (replays
possibly-incomplete migration history) and instead rebuilt it with `prisma db push`
(syncs a database directly to match `schema.prisma`, no migration history involved) —
dropped `splitkid_test`, recreated it, ran `DATABASE_URL=...splitkid_test npx prisma db
push --skip-generate` from `packages/db`. Verified the fix worked with `prisma migrate
diff --from-url <dev> --to-url <test> --script`, which came back as an empty migration
(the two databases are now byte-for-byte identical in schema).

**How to apply this going forward — corrected after the very next migration also hit
this:** `db push` doesn't write to `_prisma_migrations`, so once the test DB was
rebuilt via `db push` it had no migration history at all — the *next* schema change's
`migrate deploy` against it failed with `P3005: The database schema is not empty`
(no baseline). So the working rule is: **dev DB always uses the 5-step
diff-then-migrate-deploy process** (it has real, if historically incomplete-before-this-
session, migration tracking); **the test DB always uses `db push`** for every schema
change, incremental or not — never `migrate deploy` against it. Concretely, per schema
change: edit `schema.prisma` → generate the diff SQL → write the migration file →
`migrate deploy` against dev → `db push --skip-generate` against the test DB (skip the
migration-file step for the test DB entirely) → `prisma generate` (root).

## Fire-and-forget (`void asyncFn()`) side effects are untestable without an artificial wait — await them instead when the function already can't throw

**What happened:** Phase 6a's `logAccessGrant()` (best-effort analytics write, already
wrapped in its own try/catch so it can never throw) was called as `void
logAccessGrant(...)` in three route handlers, on the reasoning that analytics writes
shouldn't add latency to the response. The integration tests then failed with 0 rows
found — the HTTP response came back before the un-awaited insert had actually
committed, so the test's next `prisma.accessGrantEvent.findMany()` call (over the same
shared `prisma` client) raced it and lost.

**Why the "fire and forget for latency" reasoning didn't hold up:** the function was
already guaranteed non-throwing (internal try/catch). Awaiting it doesn't risk the
request on an analytics failure — that risk didn't exist either way. The only real
tradeoff was a few milliseconds of added response latency for a single-row insert,
negligible next to the value of deterministic ordering.

**Fix:** changed all three call sites from `void logAccessGrant(...)` to `await
logAccessGrant(...)`.

**How to apply this going forward:** before reaching for fire-and-forget on a side
effect, check whether the function can actually throw past the caller. If it already
swallows its own errors, awaiting it is strictly better (testable, deterministic, no
dangling promise) unless the added latency is actually measured to matter — don't
default to fire-and-forget "for safety" when the safety net is already inside the
function being called.

## A solo bootstrap GUARDIAN's one child never loses entitlement — `requiredTier` needs 2+ members to ask for anything above FREE

**What happened:** Wrote a Phase 9 proof test asserting that a grandmother's
bootstrap-created child (she's its only member, role GUARDIAN) stops being writable
once her one-time trial lapses with no parent ever having joined and no subscription
bought. The test failed — the write kept succeeding (201, not 403) — and the "bug"
was actually the test's assumption, not the code.

**Why:** `requiredTier(members, candidateOwnerId)` (`packages/shared/src/entitlement.ts`)
only returns above FREE when there's a FAMILY-role member, another GUARDIAN besides the
candidate, or `members.length >= 2`. A solo bootstrap child has exactly one member (her),
so `requiredTier` is FREE from her own perspective no matter what — and FREE-tier
coverage always satisfies a FREE requirement, same as "a lone organic parent on Free
always satisfies their own single child" (already covered by an existing entitlement
test). There is nothing role-specific here: PARENT vs. GUARDIAN doesn't matter once
she's the only person on the child at all.

**Consequence surfaced, not silently absorbed:** this means bootstrap-creating many
solo (no-parent-yet) children is NOT self-limiting via entitlement lapsing — each one
individually stays FREE-satisfied forever. The actual backstop for that pattern is
Phase 10's soft fair-use cap (spec 9.10, 10 children/15 members), not the entitlement
engine. Confirmed this is intentional (matches the already-built and previously-tested
9.18 carve-out math), not a gap introduced by Phase 9 — flagged directly in the
corrected test's comment (`apps/api/src/routes/children/bootstrapGuardian.test.ts`)
rather than papered over.

**How to apply this going forward:** don't assume a GUARDIAN-role member is
"less entitled" than a PARENT by default — `requiredTier`/`isSatisfied` are entirely
role-blind except for the FAMILY-never-covers and other-GUARDIAN-forces-FAMILY special
cases. When reasoning about whether some access "should" lapse, count members on that
specific child first, not the person's role label.

## Test-fixture emails must be all-lowercase — the server normalizes on signup, test helpers don't

**What happened:** Two Phase 10 deletion tests (`parentA@example.com`, `cancelA@example.com`)
failed deterministically and reproducibly (not a flake — same two tests failed on every
rerun, in isolation and in combination) with `verifyTestUserEmail: no verification email
captured for parentA@example.com`, even though `sendVerificationEmail`'s own swallow-
and-log catch block never logged anything (confirmed by grepping the test run's full
output) — meaning the email genuinely was sent, just not found by the lookup.

**Why:** `routes/auth/index.ts`'s signup handler does `body.email?.trim().toLowerCase()`
before creating the account and before calling `sendVerificationEmail(user)` (which
sends to `user.email`, the now-lowercased stored value). `testUtils/auth.ts`'s
`signupTestUser()` returns the *originally-passed* `email` string verbatim (not
`body.user.email` from the response), and `verifyTestUserEmail()` does an exact
`m.to === email` match against `MemoryMailSender.sent`. Every other test file in this
session happened to use all-lowercase local-parts already, so this mismatch never
surfaced until a fixture email contained an uppercase letter (`parentA`, `cancelA`).

**Fix:** renamed the fixture emails to all-lowercase (`parent-a@example.com`,
`cancel-a@example.com`).

**How to apply this going forward:** always use all-lowercase email addresses in test
fixtures in this codebase (`parent-a@example.com`, not `parentA@example.com`) — the
server-side lowercase-on-signup normalization is real, established behavior, not
something to work around in test helpers. If a mixed-case test email is ever genuinely
needed, compare against the signup response's own `user.email` instead of the locally-
held input string.

## Pre-deploy review found the calendar_events drift (lesson above) would have broken a real deploy — fixed by making that migration idempotent

**What happened:** Asked to verify readiness to commit/push/deploy, re-ran `prisma migrate
diff` against a **freshly** `migrate deploy`'d throwaway database (not the already-migrated
dev DB) — something no prior phase in this session had actually done. It came back non-empty:
the backfill migration for the pre-existing `calendar_events` drift (see the lesson above)
had been written as a plain one-shot migration and `prisma migrate resolve --applied`'d
against dev directly, without ever proving it would apply cleanly to a database that had
never seen the drift. A genuinely fresh database (CI, staging, or a first-time production
deploy) would have been missing `confirmable`/`contactName`/`contactDetail`/`assignedNote`
and two whole tables — the app would 500 on its first calendar-event request.

**Compounding risk, discovered from `DEPLOYMENT.md` + git history, not assumed:** this repo
has a real configured production target (`kidcom.org`, Plesk, `origin/master` — commit
history includes production bug-fix commits like "Fix ... crashing most API routes" and a
"still-in-testing production deployment" comment in `config.ts`). This session has no way to
inspect that production database's actual current schema state — it might already have the
same undocumented drift dev did (via the same kind of out-of-band `db push`), or it might
not. Relying on a human to manually run `prisma migrate resolve --applied` on production
*only if* it turns out to already have the drift is exactly the kind of manual, easy-to-get-
wrong step that shouldn't gate a deploy.

**Fix:** rewrote the migration to be fully idempotent (`ADD VALUE IF NOT EXISTS`,
`ADD/DROP COLUMN IF EXISTS`, `CREATE TABLE/INDEX IF NOT EXISTS`, and `DO $$ ... EXCEPTION
WHEN duplicate_object THEN NULL; END $$;` guards around the three `ADD CONSTRAINT`s, which
have no native `IF NOT EXISTS` in Postgres). Proved it correct both ways, not just asserted:
built one throwaway DB that had never seen the drift (`migrate deploy` → diff against
`schema.prisma` → empty) and a second throwaway DB seeded with the *exact* historical drift
SQL unregistered (simulating "production secretly already has this, same as dev did") →
`migrate deploy` → diff against `schema.prisma` → also empty, no errors either way.

**How to apply this going forward:** a migration is only proven safe once it's been run
against a **freshly-created** database via `migrate deploy`, separately from whatever
already-migrated dev/test database the session has been iterating against — applying
cleanly to an incrementally-updated dev DB proves nothing about a first-time deploy. When a
migration is backfilling *known* undocumented drift and there's any real deploy target whose
current state can't be directly inspected, write it idempotently rather than requiring a
manual resolve step timed to a guess about that target's state — verify idempotency by
actually constructing both the "never had it" and "already secretly has it" starting states
and running the real migration against each, not by reasoning about the SQL in the abstract.

## Adding encryption to a column breaks any earlier test that asserted the raw DB value

**What happened:** Phase G's MedicalInfo field encryption landed after Phase A's claim/
merge content-migration test (`bootstrapGuardian.test.ts`) was already written and
passing — that test creates a medical-info entry through the real API, then reads the
row back directly via `prisma.medicalInfo.findMany(...)` and asserts `condition ===
"Peanuts"` to prove content actually moved during a merge. Once Phase G started
encrypting `condition` at write time, the raw column no longer holds plaintext, so this
assertion started failing — not because the merge logic broke, but because the earlier
test's assumption ("the DB column holds what I sent the API") stopped being true.

**Fix:** imported `decryptField` from `lib/medicalEncryption.ts` into the Phase A test
and decrypted the raw value before asserting on it, rather than reading it through the
API a second time (which would have masked whether the *stored* value actually moved,
the thing the test exists to prove).

**How to apply this going forward:** whenever a phase changes how a column is stored
(encryption, encoding, a new default) — re-run the *full* suite, not just the new
phase's own tests, and specifically look for other tests that read that column directly
via Prisma rather than through the API. Assertions like `row.field === plaintext` are
exactly the kind of thing that silently goes stale; the API-level round-trip tests
(GET returns the right value) don't need touching, since the encrypt/decrypt happens
transparently there — only direct-DB assertions do.

## Gzipping stored media originals turned out to be a bad idea, not just low-value — dropped, not built

**What happened:** The plan called for `LocalDiskStorage.save()` to gzip original
files transparently before writing, with `readStream()` gunzipping on the way back
out. Before implementing it, traced every call site of `mediaStorage.pathFor()` and
`.readStream()` and found two real problems, not just the already-flagged "gzip
barely shrinks JPEG/WebP/MP4" caveat:

1. `worker.ts`'s `processImage`/`processVideo` hand sharp/ffmpeg the original file's
   **raw filesystem path** (`mediaStorage.pathFor(originalKey)`) directly — they
   read it themselves, bypassing `MediaStorage`'s own read methods entirely. Gzip
   the file at `save()` time and sharp/ffmpeg would try to parse compressed bytes
   as an image/video and fail outright, every time.
2. `readStream()` is the *one* method the serving route (`GET /media/:id`) uses for
   **both** originals and derivatives (`derivedPath ?? originalPath`). Making it
   unconditionally gunzip would corrupt every derivative response (WebP/poster
   JPG), which was never gzipped in the first place — there's no per-key marker
   distinguishing "this one's compressed" from "this one isn't" without adding
   real complexity (a schema field, or a second storage-key convention) for a
   feature that saves close to nothing on already-entropy-coded formats.

**Decision:** did not implement it. Documented why directly in the phase's
`tasks/todo.md` entry rather than silently dropping it — the caveat in the plan
("gzip won't meaningfully shrink these formats") was already a reason to be
skeptical of the value; finding it would also require either breaking media
processing or adding real complexity to avoid breaking it tipped this from
"low-value" to "not worth building," full stop.

**How to apply this going forward:** before implementing a "wrap this existing I/O
layer transparently" change (compression, encryption-at-a-storage-layer, etc.),
trace every actual call site of the interface being wrapped — not just the ones the
new feature cares about. A method used by more than one caller (here, `readStream()`
serving both originals and derivatives) can't gain new per-call behavior without
either a way to distinguish those calls or applying to all of them, and a caller
that bypasses the interface entirely (`pathFor()` handed to an external library)
can't be helped by wrapping the interface at all.
