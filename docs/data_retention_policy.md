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
  - **How (v3.0 Phase 7, `apps/api/src/lib/accountDeletion.ts`):** `DELETE /auth/me`
    with `{ "confirm": true }`. The user row stays as an anonymous tombstone
    (`users.deletedAt` set; name "Former member"; email, phone, password, photo,
    preferences cleared) so retained history keeps a valid author. Removed: provider
    links, codes and tokens, push subscriptions, notification settings and list,
    personal notes, bookmarks, download links, reactions, conversation memberships,
    unsent invites, upgrade requests, the profile photo and never-attached uploads
    (files deleted too), and all child access. The subscription is cancelled. A child
    only this person could see is soft-deleted (purged after the restore window).
  - **Refused (409 `LAST_GUARDIAN`)** while the person is the last parent/guardian
    of a child others still follow — another parent must be invited or promoted first.
  - Login events are kept for their normal 12 months (fraud and abuse checks, see
    `docs/management_data.md`), then purged by the daily job.

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
- Key rotation keeps every value readable: the old key goes in
  `MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS` until `npm run medical:rekey` has
  re-encrypted everything (docs/deployment_guide.md §8.5).

## Photos and videos (encryption, capture metadata, upload origin)

- All media files are encrypted at rest (AES-256-GCM, per-file keys; see
  `docs/deployment_guide.md` → Media encryption). Not end-to-end: the server
  decrypts to make thumbnails, playable videos and downloads.
- **Capture metadata** read from each upload where the phone kept it: GPS
  latitude / longitude / altitude, capture time, device make and model
  (`MediaAsset.captured*`, `deviceMake`, `deviceModel`). Mobile browsers often
  remove location before upload, so coverage is partial.
- **Upload origin**: the uploader's IP address and user agent
  (`MediaAsset.uploadIp`, `uploadUserAgent`).
- **Purpose**: abuse and fraud detection in the admin tool (manage.kidcom.org),
  e.g. comparing where media was taken and uploaded from with where accounts
  sign in. Lawful basis proposed: legitimate interest (GDPR Art. 6(1)(f)) in
  protecting children and accounts — **to be confirmed by Charlie / legal, with
  a DPIA, before manage.kidcom.org uses it, and named in the privacy notice.**
- **Never shown in the app** to anyone, including the uploader: no API
  response includes these fields (covered by `routes/mediaPrivacy.test.ts`).
- **Location inside files**: the uploader can download their original as
  uploaded. Everyone else gets a copy with the location removed (JPEG EXIF
  GPS + XMP GPS zeroed/dropped, videos remuxed without metadata; pixels and
  streams untouched), or the optimized version where that isn't possible. The
  in-app versions (WebP, posters, playback MP4) never carry metadata.
- Retention: with the media asset itself (deleted with it).

## Sign-in events

- `LoginEvent`: every sign-in (method: password + 2FA, Google, Microsoft,
  signup, password reset, invite) and failed attempt (wrong password — with the
  typed email even when no such account exists — or wrong 2FA code), with IP
  address and user agent. Same purpose and legal basis as upload origin above.
- Readable by the admin tool; a user could be shown their own (RLS allows only
  that). Deleted after **12 months** by the daily 04:00 job
  (`purgeExpiredLoginEvents`).

## SMS send log

- `SmsSend` (`sms_sends`): every text the API sends. It records the number, the
  purpose (verify number / password reset), the account it was sent for, and
  the time.
- **Purpose:** the SMS toll-fraud guard caps texts per number and in total, and
  the log is an abuse signal for manage.kidcom.org. The legal basis is
  legitimate interest (fraud prevention).
- **Retention:** deleted after **90 days** by the daily 04:00 job. It is kept
  through an account deletion, for the same fraud-prevention reason as sign-in
  events, and purged on the same schedule.

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
  `docs/deployment_guide.md` doesn't describe a backup strategy yet).
- Server access/request logs, if any are ever added at the infrastructure level,
  are outside this document's scope.
