# Data retention policy

What KidCom keeps, for how long, and by what mechanism. First written in the
v2 post-launch GDPR pass; kept current through v3.0 (`tasks/todo.md`).

## Account data (a user's own profile, moments, personal notes, etc.)

- **Kept**: for as long as the account exists.
- **Export**: `GET /auth/export` — a real, scoped export (the caller's own profile,
  the children they have access to, moments they authored, personal notes,
  growth entries visible to them), available on demand, self-service.
- **Deletion** (`DELETE /auth/me`) — decided by the product owner 2026-09-23:
  - The **account** goes: profile, sign-in methods (password, Google/Microsoft
    links), verified phone, sessions, SMS/email codes, push subscriptions,
    notification preferences, personal notes, and the user's access to every child.
  - **Contributions to a child's shared family history stay** — moments, comments,
    photos/videos, messages, list claims, calendar requests. They belong to the
    child's record that the remaining family members share, so they are retained
    after the author leaves (the product owner relies on a family-related exemption
    from erasure here; confirm the legal basis with counsel before launch and name
    it in the privacy notice). Retained items are shown as authored by
    "Former member", never with the deleted person's name or photo.
  - The user's own subscription ends with the account; children it covered fall
    back to whatever else covers them (spec §2.2).
  - **Status: not yet working.** Today the delete fails for every user — 12 `User`
    relations have no `onDelete` rule, so Postgres refuses it. Fix scheduled for
    v3.0 Phase 7 (retain-and-anonymise as above, with tests). See
    `tasks/todo.md` → "Known defects".

## Deleting a complete family circle

Not a product feature (yet) — the procedure for support/operations when an entire
family asks to be removed, or for clearing test data. A "family circle" is not a
stored entity: it is the set of children connected through shared `ChildAccess`
rows, plus every account whose access is **only** to those children.

1. **Scope it.** Start from one child or account and follow `ChildAccess` both ways
   (child → members → their other children → …) until the set stops growing.
   Anyone with access to a child **outside** the set keeps their account; only
   their access to the circle's children is removed.
2. **Read with RLS bypassed.** Child-scoped tables are protected by row-level
   security; a plain query without a user context sees **zero rows** and will
   under-count. Use `withRlsBypass` (`apps/api/src/lib/rls.ts`) for both the
   survey and the delete.
3. **Delete in one transaction, in this order** (earlier steps remove the rows
   that would otherwise block later ones):
   1. invites to the circle's children or sent by its accounts
   2. clear `MediaAsset.avatarForChildId` for the circle's children
   3. media owned by the circle's accounts (and the files in media storage)
   4. comments, then moments, authored by the circle's accounts
   5. messages sent by the circle's accounts
   6. clear list-item claims/assignments pointing at those accounts
   7. swap, calendar-event and upgrade requests by those accounts
   8. subscriptions owned by those accounts
   9. the children (cascades access, medical info, growth, schedule, custody,
      calendar, lists, moment tags, deletion requests)
   10. the accounts (cascades tokens, codes, sign-in links, notes, push, prefs)
4. **Revoke sessions** in Redis: each account's `kidcom:usess:<userId>` index and
   the `kidcom:sess:*` keys it lists.
5. **Remove media files** for the deleted `MediaAsset` rows from media storage.
6. **Verify** with RLS bypassed that no rows reference the deleted ids.

Unlike a member leaving, this deletes the circle's shared history too — nobody
remains who shares it. Used 2026-09-23 to clear all test accounts from the dev
database (only `charlie@wurk.dk` and its children kept).

## Child records

- **Kept**: for as long as the child has at least one member, per invariant I-3.
- **Soft delete**: spec 9.21 — deleting a child sets `Child.deletedAt` rather than
  removing the row immediately, with a **30-day restore window**
  (`POST /children/:childId/restore`). All-`PARENT`-confirm, `GUARDIAN`-fallback
  if none exist (see `apps/api/src/lib/deletion.ts`).
- **Hard delete**: a daily job (`purge-deleted-children`, `apps/api/src/lib/childPurge.ts`,
  scheduled 04:00 in `worker.ts`) hard-deletes any child whose `deletedAt` is more
  than 30 days in the past. Content cascades via the `onDelete: Cascade` relations
  on `Child` (access, medical, growth, calendar, lists, moment tags, …).
- Until this job existed (found while writing this document), a soft-deleted child
  simply stayed soft-deleted forever past its 30-day window — flagged and fixed as
  part of this pass, not a pre-existing intentional gap.

## Special-category data (MedicalInfo)

- `MedicalInfo.condition`/`description`/`emergencyNote` are GDPR Art. 9
  special-category data about a minor — encrypted at rest at the application layer
  (AES-256-GCM, `apps/api/src/lib/medicalEncryption.ts`), independent of whatever
  disk/database-level encryption the hosting provider offers.
- Follows the same lifecycle as the `Child` record it belongs to (cascades on hard
  delete, no separate retention window).

## Billing / subscription data

- `Subscription` rows persist for the life of the owning account (billing history).
- An abandoned QuickPay checkout (`status: PENDING`, never completed) is
  reconciled — not retained indefinitely — by the daily `reconcile-subscriptions`
  job (`apps/api/src/lib/billingReconciliation.ts`): reverted to `FREE`/`ACTIVE`
  after 24 hours if QuickPay confirms it was never completed.

## Analytics

- `AccessGrantEvent` rows (spec 9.20) carry no `childId`/`userId`/`email` at the
  schema level — they cannot be tied back to a specific person or child even in
  principle, so there's no per-record retention concern; they're aggregate-only
  data from the moment they're written.

## Auth security tokens

- `EmailVerificationToken` / `LoginTwoFactorCode` / `PasswordResetToken`: single-use,
  short-lived (24h / a few minutes / 1h respectively), deleted on use or replaced
  on re-request — never accumulate.

## What this document does not cover

- Backup/disaster-recovery retention (how long database backups themselves are
  kept) is an infrastructure/hosting decision, not an application-layer one — set
  wherever backups are actually configured (currently undocumented;
  `docs/plesk_deployment.md` doesn't describe a backup strategy yet).
- Server access/request logs, if any are ever added at the infrastructure level,
  are outside this document's scope.
