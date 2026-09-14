# Data retention policy

What KidCom keeps, for how long, and by what mechanism. Written as part of the
post-launch backlog's GDPR pass — see `tasks/todo.md`'s Phase H entry for how this
was scoped (export and account-deletion already existed; this document plus the
child-purge job were the two real gaps found).

## Account data (a user's own profile, journal posts, personal notes, etc.)

- **Kept**: for as long as the account exists.
- **Export**: `GET /auth/export` — a real, scoped export (the caller's own profile,
  the children they have access to, journal posts they authored, personal notes,
  growth entries visible to them), available on demand, self-service.
- **Deletion**: `DELETE /auth/me` — immediate, cascading (every `onDelete: Cascade`
  relation on `User` in `schema.prisma`). Does **not** delete a `Child` record
  itself — a co-parent may still need it — only the deleting user's own access and
  authored content. No recovery window; this is a hard delete, by design (matching
  the "Delete Account" action's expected finality).

## Child records

- **Kept**: for as long as the child has at least one member, per invariant I-3.
- **Soft delete**: spec 9.21 — deleting a child sets `Child.deletedAt` rather than
  removing the row immediately, with a **30-day restore window**
  (`POST /children/:childId/restore`). All-`PARENT`-confirm, `GUARDIAN`-fallback
  if none exist (see `apps/api/src/lib/deletion.ts`).
- **Hard delete**: a daily job (`purge-deleted-children`, `apps/api/src/lib/childPurge.ts`,
  scheduled 04:00 in `worker.ts`) hard-deletes any child whose `deletedAt` is more
  than 30 days in the past. Content cascades via the same `onDelete: Cascade`
  relations `DELETE /auth/me` and claim/merge already rely on — no per-model cleanup
  code exists or is needed.
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
  wherever backups are actually configured (currently undocumented; DEPLOYMENT.md
  doesn't describe a backup strategy yet).
- Server access/request logs, if any are ever added at the infrastructure level,
  are outside this document's scope.
