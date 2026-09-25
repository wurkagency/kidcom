# Privacy notice — family-relationship analytics section

Drafted for spec 9.20 (post-launch backlog Phase I): the required privacy-notice
copy update for the access-grant analytics instrumentation, to be published at
`kinnd.eu/privacy` alongside the existing policy. This file is the copy only —
publishing it is the user's own action, not something this codebase's email
templates or web app link to directly (by explicit choice, not an in-app page).

Suggested section heading and placement: add as its own subsection under wherever
the existing policy discusses analytics/product-improvement data, or as a new
subsection if none exists yet.

---

## How we use family-relationship data

When someone joins a child's circle on Kinnd — whether by creating a child's
profile or accepting an invitation — we record a small amount of anonymous,
aggregate data to help us understand how families actually use Kinnd and improve
the product for everyone. This section explains exactly what that involves.

**What we record:**

- The relationship the person selected for themselves (for example, "Grandmother"
  or "Co-Parent").
- If they joined via an invitation, the relationship of the person who invited
  them, and how long it took them to accept the invitation after it was sent.
- The date and time this happened.

**What we deliberately do not record, ever, anywhere in this data:**

- Which child, or whose account, the event relates to. This data cannot be traced
  back to a specific person or a specific child's profile — not because we choose
  not to look, but because that information is never captured in the first place.
- Any derived assumption about a person's gender. We do not infer or store gender
  from a relationship label (for example, we never treat "Grandmother" as implying
  anything about that person's gender beyond the word itself), and no query we run
  against this data ever attempts to do so.

**How we use it:** Only in aggregate, across many families at once — never to look
at an individual event on its own. We only report or analyze this data when it
represents at least 10 separate instances, so no result could ever meaningfully
describe a single family or individual.

**Why we collect it:** To understand which relationships families are actually
using Kinnd to coordinate around, and how quickly invited family members join —
purely to guide what we build next, not to build a profile of any individual
family or person.

---

### Implementation cross-reference (not part of the published copy)

- Model: `AccessGrantEvent` (`packages/db/prisma/schema.prisma`) — `relationship`,
  `inviterRelationship` (null for a bootstrap grant — there is no inviter),
  `timeToAcceptMs` (null for a bootstrap grant), `createdAt`. No `childId`,
  `userId`, or `email` field exists on this model at all — the "cannot be traced
  back" claim above is a schema-level guarantee, not a query-layer promise.
  Instrumented from day one (spec 9.20) via `apps/api/src/lib/accessGrantAnalytics.ts`,
  called from `POST /children` (bootstrap grants) and both invite-accept paths.
- The "no gender derivation" and "10-record minimum" rules are documented
  directly on the model in `schema.prisma` for whoever writes the first real
  query against this table, and are proven by test
  (`apps/api/src/lib/accessGrantAnalytics.test.ts` — the created row's field set
  is asserted exhaustively, and the `data:` block passed to Prisma is asserted to
  contain no gender reference).
