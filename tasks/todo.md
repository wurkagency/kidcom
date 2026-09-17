# KidCom — Build Plan (chunked)

Source of truth: `docs/stitch_splitkid/` (Stitch design export + PRD) and the
architecture plan in the KidCom Claude project (`claude/architecture_plan.md`).

## Chunk 1 — Repo scaffold + local Docker dev environment ✅
- [x] Monorepo (npm workspaces): `apps/web`, `apps/api`, `packages/db`, `packages/shared`
- [x] `docker-compose.yml` — Postgres 16 + Redis 7 (local dev only)
- [x] Prisma schema — first pass covering all PRD entities
- [x] Express API skeleton — `/health`, config, Prisma wiring, error middleware, session-cookie stub, route folder placeholders
- [x] Vite + React + TS + Tailwind PWA skeleton — Kindred Path design tokens, `vite-plugin-pwa` manifest, 5 placeholder routes + bottom nav matching the Stitch mockup
- [x] `DEPLOYMENT.md` — documents the Plesk mapping (not executed)
- [x] Verified in the cloud sandbox: `npm install`, `npm run build:web` (Vite + PWA plugin, output confirmed), `tsc --noEmit` for `apps/api` and `packages/shared`, `docker compose config`, and a manual structural review of `schema.prisma` (all named relations pair up correctly)
- [x] Verified end-to-end on Charlie's machine: `docker compose up -d`, `npm run prisma:generate`, `npm run prisma:migrate` (initial migration `init` applied to local Postgres), `npm run dev` — API on :4000 (`/health` returns `{"status":"ok",...}`), web on :5173 rendering the Kindred Path theme + 5-tab bottom nav correctly
- [x] Fixed along the way: root `.env` wasn't reaching workspace scripts (npm changes cwd per-workspace) — added `dotenv-cli` so every root script explicitly loads it; replaced the bash-only `&` in the `dev` script with `concurrently` for cross-platform reliability

**Chunk 1 complete.**

## Chunk 2 — Auth + household/child access model
- [x] Signup/login/logout/me — `bcryptjs` + `express-session` + `connect-redis`, session cookie unset locally / `.splitkid.com` in prod
- [x] `Child` CRUD (`POST /children`, `GET /children`) + `ChildAccess` creation on child creation
- [x] `requireChildAccess` middleware (for future child-scoped routes — calendar/journal/media/lists)
- [x] Invite create + accept endpoints — **delivery stubbed**: logs the accept link to the server console instead of emailing/texting it (real provider deferred to chunk 7, see plan notes)
- [x] Frontend onboarding flow matching Stitch mockups: Welcome → Create Account → Tell Us About Your Child → Invite Co-parent, plus a Login screen (no mockup source) and route guards in `App.tsx`
- [ ] Not yet: subscription-tier child-count enforcement (Free/Parents/Family caps — needs chunk 7's real billing status first), password reset, real invite delivery, a frontend `/invite/:token` accept page
- [x] Verified in the cloud sandbox: `npm install`, `tsc --noEmit` for `apps/api`/`apps/web`/`packages/shared` (api's only errors are the same missing-generated-Prisma-client symptom as chunk 1 — expected here, resolves on `npm run prisma:generate`), `npm run build:web`
- [ ] **Needs verification on Charlie's machine**: `npm run prisma:migrate` (new `Invite.token` field), then `npm run dev`, click through the full onboarding flow, confirm session cookie persists across a refresh, confirm the invite link is logged to the API console

## Chunk 3 — Child profiles, medical info, growth charts
- [x] Child detail + edit (`GET/PATCH /children/:childId`) — profile picture still a placeholder (deferred to the media chunk)
- [x] Medical info CRUD (allergy/condition cards, color-coded per the mockup) — **not yet encrypted at rest**, see Open Items below
- [x] Country-default medical schedule (`MedicalScheduleTemplate` + new `ChildScheduleCompletion`) — DK seed data in `packages/db/prisma/seed.ts`, flagged as first-pass, needs a real sst.dk cross-check before real users see it
- [x] Growth entries (`GET/POST /children/:childId/growth-entries`) + real SVG line chart from actual logged data — **no WHO percentile overlay** (needs real WHO LMS reference tables, not fabricated — deferred)
- [x] Emergency contacts (`EmergencyContact` CRUD + auto-derived family rows from `ChildAccess`) — new model, not in the original chunk 3 heading but the `emergency_contacts` mockup needed it
- [x] Frontend: `ChildProfilePage`, `ChildMedicalPage`, `ChildContactsPage` (new), `GrowthPage` (rewritten from placeholder), `ProfilePage` now lists children, `App.tsx` routes, `GrowthChart` component (inline SVG)
- [x] "Invite Family Member" reuses the chunk 2 invite flow (`OnboardingInvitePage` now takes `?childId=&role=` so it's not duplicated)
- [x] Verified in the cloud sandbox: `npm install`, `tsc --noEmit` for `apps/api`/`apps/web`/`packages/shared` (api's only errors are the same missing-generated-Prisma-client symptom as chunks 1–2), `npm run build:web`, manual review of the two new Prisma models/relations
- [x] Verified on Charlie's machine: `npm run prisma:migrate`, `npm run prisma:db:seed` (fixed a missing `packages/db/tsconfig.json` along the way — ts-node was falling back to a default config with a module/moduleResolution conflict), `npm run dev` and clicked through Profile → child → Medical/Contacts and Growth

**Chunk 3 complete.**

## Chunk 4 — Calendar, custody plans, swap requests
- [x] Custody plan patterns (Week on/week off, 2-2-3) — **computed on read from `CustodyPlan.patternDays`, not materialized into events** (see `packages/shared/src/custody.ts`'s `resolveCustodyForDate`); one active plan per child, set from the Calendar tab's `CustodySetup` prompt when none exists
- [x] Appointments (`CalendarEvent` CRUD, `APPOINTMENT`/`PLANNED_HOLIDAY` categories) + national holidays — DK holidays computed with a Gregorian-Easter helper (`apps/api/src/lib/dkHolidays.ts`) and lazily seeded per child/year on first calendar load; **first-pass list, double-check against an authoritative DK calendar before real users** (same caveat as the chunk 3 medical seed — flag Store Bededag's 2024 status especially)
- [x] Swap request + approval flow (`SwapRequest` now targets a `childId`+`date` directly rather than a stored `CalendarEvent` — see chunk 4 plan notes) — request UI built (`SwapRequestCard`), **approve/decline UI not built yet** (backend `PATCH /swap-requests/:id` exists; surfacing pending requests to the other parent is a good chunk 6/messaging-adjacent follow-up)
- [x] Frontend: `CalendarPage` rewritten from placeholder (week strip, legend, day timeline), `CustodySetup` and `SwapRequestCard` components (new)
- [x] Verified in the cloud sandbox: `npm install`, clean `tsc --noEmit` for `apps/web`/`packages/shared` (api's only errors are the same missing-generated-Prisma-client symptom as chunks 1–3), `npm run build:web`
- [ ] **Needs verification on Charlie's machine**: `npm run prisma:migrate` (new `SwapRequest` shape — drops its `CalendarEvent` link, adds `childId`+`date`), `npm run dev`, then on the Calendar tab: set up a custody schedule, confirm the week strip/legend reflect it, add an appointment and confirm it shows in the timeline, and send a swap request
- [ ] Gmail/Outlook calendar sync — **phase 2, deferred**

## Chunk 5 — Journal + media pipeline
- [x] Journal posts (title, text, media) — `GET/POST /children/:childId/journal`, `DELETE /:postId` (author only)
- [x] Comments (`GET/POST /children/:childId/journal/:postId/comments`) and a toggleable "Love" reaction (`JournalReaction`, new model — the mockup's Love button had no model behind it yet)
- [x] Upload → BullMQ job → derivatives: images via `sharp` (WebP, resized, dimensions extracted), video via `fluent-ffmpeg`/`ffmpeg-static` (JPEG poster frame — full WebM transcode of the original would be a heavier follow-up if needed) — **lossless original is kept on disk** (`MediaAsset.originalPath`) but there's no download-the-original UI yet, just the derivative shown in the feed
- [x] `MediaStorage` interface + `LocalDiskStorage` (`apps/api/src/lib/mediaStorage.ts`) — the storage abstraction DEPLOYMENT.md called for, so swapping to S3-compatible storage later doesn't touch route/worker code
- [x] Real standalone worker entrypoint (`apps/api/src/worker.ts`, matches the `dist/worker.js` path DEPLOYMENT.md already documented) — wired into `npm run dev` via a third `concurrently` process
- [x] Media served through an authenticated route (`GET /media/:id`, session-cookie + `ChildAccess` check) rather than DEPLOYMENT.md's originally-planned signed URLs — simpler for now, swappable later without changing callers (see chunk 5 plan notes)
- [ ] Media gallery view + filtering — **not built**; the Journal feed itself has a per-child filter chip, but a dedicated gallery/grid view of just the photos is a good follow-up, not core to this chunk
- [x] Verified in the cloud sandbox: `npm install` (sharp/ffmpeg-static native binaries downloaded fine here, unlike Prisma's blocked CDN), clean `tsc --noEmit` for `apps/web`/`packages/shared` (api's only errors are the same missing-generated-Prisma-client symptom as chunks 1–4), `npm run build:web`
- [ ] **Needs verification on Charlie's machine**: `npm install` (confirms `sharp`/`ffmpeg-static` install cleanly on Windows too), `npm run prisma:migrate` (`JournalReaction` + `MediaAsset` fields), `npm run dev` (now also starts the worker), then on the Journal tab: post with a photo, confirm it shows "Processing…" then the real image once the worker finishes, react/comment on it, and try a short video if one's handy to confirm the ffmpeg path works end to end

## Chunk 6 — Shared lists + messaging
- [x] **No Stitch mockup exists** for these screens (`docs/stitch_splitkid/` has no `lists`/`messages` dir) — built from the PRD text using the existing Kindred Path tokens, per Charlie's explicit call (see chunk 6 plan notes)
- [x] Necessities + wishlist (`ListItem`, already in the chunk-1 schema scaffold) — claim-to-provide toggle, size shown as a plain optional text field with the child's `clothingSize`/`shoeSize` surfaced as a placeholder hint rather than a hard auto-fill (`ChildDetail` has those fields; the PRD's "pulled from profile" line is honored loosely, not literally auto-populated)
- [x] Messaging (`Thread`/`ThreadMember`/`Message`, already in the schema) — 1:1 threads reuse an existing pair instead of duplicating, group threads supported, polling-based (thread list ~15s, open thread ~4s) per the architecture doc's realtime decision, photo attachment reuses the chunk 5 upload flow. Added `ThreadMember.lastReadAt` (new field) for an unread-thread indicator — the only schema change this chunk needed
- [x] Personal notes (`PersonalNote`, already in the schema) — private per-user CRUD, no sharing UI
- [x] Entry points (resolving the nav ambiguity — bottom nav stays fixed at 5 tabs): "Shared List" added to `ChildProfilePage` (child-scoped, same pattern as chunk 3's Medical/Contacts links); "Messages" and "My Notes" added to `ProfilePage` as new link cards (not child-scoped)
- [x] Verified in the cloud sandbox: `npm install`, clean `tsc --noEmit` for `packages/shared` and `apps/web` (zero errors), `apps/api`'s only errors are the same missing-generated-Prisma-client symptom as every prior chunk (new instances in `listItems.ts`/`messages/index.ts`/`notes/index.ts` are the same expected class), `npm run build:web`
- [ ] **Needs verification on Charlie's machine**: `npm run prisma:migrate` (adds `ThreadMember.lastReadAt`), `npm run dev`, then: from a child's profile add a necessity and a wishlist item and claim one from a second account, from Profile open Messages and start + send in a thread with a photo, confirm the unread dot clears on open, and add/edit/delete a personal note

## Chunk 7 — Subscriptions (QuickPay) + invites
- [x] Free/Parents/Family tiers, monthly + annual billing — exact PRD pricing (Parents 29 DKK/mo or 275 DKK/yr for 1 kid, Family 59 DKK/mo or 559 DKK/yr unlimited), `Subscription.status`/`billingPeriod` (new fields) added alongside the existing `tier`/quickpay-id/trial fields
- [x] QuickPay integration (`apps/api/src/lib/quickpay.ts`) — real client against their documented v10 API (create subscription, payment-window link, recurring charge, HMAC-SHA256 webhook checksum verification) — **can't be exercised end-to-end from this sandbox** (no merchant account, no network path to quickpay.net here), verified by code review against their docs only. Webhook payload field names in particular should be double-checked against a real test callback
- [x] `POST /billing/subscribe` + `POST /billing/webhook` (no auth — checksum-verified) + `GET /billing/status`; daily renewal job in `apps/api/src/worker.ts` (03:00, BullMQ repeatable) charges due subscriptions
- [x] Trial expiry enforcement — `requireActiveAccess` middleware blocks mutating `/children/*` requests once a Free-tier trial (`Subscription.trialEndsAt`) has passed; reads stay open. Deliberately **per-user, not per-child** — flagged simplification, see chunk 7 plan notes for why
- [x] 1-child cap (Free/Parents) vs unlimited (Family) on `POST /children` — closes the TODO left since chunk 3
- [x] Real invite delivery — `MailSender` interface (`apps/api/src/lib/mailSender.ts`), same swappable treatment `MediaStorage` got in chunk 5. **No real provider wired up yet** (still console-logs, just through the interface) — per your call, this stays a stub for now rather than picking a vendor
- [x] SMS invite delivery — **still out of scope**, deferred like calendar sync, per your call
- [x] Missing `/invite/:token` accept page built (flagged as needed since chunk 2) — invite flow is now actually usable end to end
- [x] Verified in the cloud sandbox: `npm install` (no new dependencies needed — quickpay client uses only built-in `crypto`/`fetch`), clean `tsc --noEmit` for `packages/shared`/`apps/web`/`apps/api` (api's only errors are the same missing-generated-Prisma-client symptom as every prior chunk — zero *new* errors from any chunk 7 file), `npm run build:web`, manual read-through of the webhook checksum logic and the trial/cap gating
- [ ] **Known gap, flagged not fixed**: an abandoned QuickPay checkout leaves a `Subscription` at the new tier with `status: PENDING` indefinitely — no reconciliation/cleanup job yet, and `requireActiveAccess` doesn't gate `PENDING` (only expired-trial `FREE`), so this is a soft spot worth a follow-up pass, not a silent bug
- [ ] **Needs verification on Charlie's machine**: `npm run prisma:migrate`, set `QUICKPAY_API_KEY`/`QUICKPAY_PRIVATE_KEY` (test mode) in `.env`, `npm run dev`, then: confirm a fresh Free signup never gets gated, send an invite and confirm `/invite/:token` now works end-to-end, try upgrading to Parents/Family with a real QuickPay test card and confirm the webhook flips `status` to `ACTIVE` (the webhook callback needs QuickPay to reach your local dev server — likely needs a tunnel like ngrok, since `localhost` isn't publicly reachable)

## Chunk 8 — Push notifications
- [x] Switched `vite-plugin-pwa` from `generateSW` to `injectManifest` mode — the default mode has no hook for a custom `push` event listener, so this was a real config change (`apps/web/vite.config.ts`), not additive. Hand-written `apps/web/src/sw.ts` calls `precacheAndRoute` itself (same precaching `generateSW` gave for free) plus `push`/`notificationclick` listeners. `sw.ts` needed its own `tsconfig.sw.json` (WebWorker lib) since it can't share the app's DOM-lib tsconfig — verified in the cloud sandbox with a standalone `tsc --noEmit` pass
- [x] Subscription capture — `apps/web/src/lib/push.ts` (permission request, `pushManager.subscribe`, `POST /push/subscribe`), a Notifications card on `ProfilePage` reflecting live state (off/on/blocked)
- [x] Backend: `PushSubscription` model already existed from chunk 1 — added `apps/api/src/lib/webPush.ts` (`web-push` wrapper, prunes dead 404/410 subscriptions automatically), `POST/DELETE /push/subscribe`, `GET /push/vapid-public-key`
- [x] Triggers (all net-new hooks — confirmed these were plain, side-effect-free `.create()` calls before this chunk): new message → pushes other thread members; swap request created → pushes the child's other parent(s); swap request approved/declined → pushes the original requester; appointments starting within ~24h → daily `remind-appointments` job (08:00) pushes everyone with access to that child, stamping the new `CalendarEvent.remindedAt` field so it's never sent twice
- [x] **Real VAPID keypair generated in the sandbox** (unlike QuickPay, this needed no external account — see below) and the send/receive code is real, not a stub
- [x] Verified in the cloud sandbox: `npm install` (added `web-push` + `@types/web-push`), generated a working VAPID keypair with `npx web-push generate-vapid-keys`, clean `tsc --noEmit` for `packages/shared`/`apps/web`/`apps/api` (api's only errors are the same missing-generated-Prisma-client symptom as every prior chunk) plus a clean standalone check of `sw.ts`, and `npm run build:web` — confirmed the `injectManifest` switch actually works end-to-end (build log shows `dist/sw.js` built from `src/sw.ts` with precaching, not the old auto-generated Workbox output)
- [ ] **Needs verification on Charlie's machine**: `npm run prisma:migrate` (`CalendarEvent.remindedAt`), add the VAPID keys below to `.env`, `npm run dev`, then: turn on notifications from Profile (grants the browser permission prompt), send a message from a second account/browser and confirm a real OS notification appears and clicking it opens the right thread, request then approve/decline a swap and confirm both directions push, and add an appointment for tomorrow to confirm the reminder query picks it up (don't need to wait for 08:00 — checking the `CalendarEvent` row's eligibility, or firing the `remind-appointments` job manually, is enough)

**VAPID keypair — generate your own, don't reuse a checked-in one:**
```
npx web-push generate-vapid-keys
```
Paste the output directly into `.env` (never into this file). *(A real keypair was generated and committed here in an earlier version of this file for dev convenience — redacted during the security review: committed secrets should be treated as compromised regardless of how low-stakes they seem. The local dev `.env` already uses a different, unrelated key, so nothing that depended on the redacted one breaks.)*

## Home Dashboard
- [x] `HomePage.tsx` had been the unbuilt chunk-2 placeholder ever since — built out to match `docs/stitch_splitkid/home_dashboard/code.html`: greeting, a bento grid (Today's Custody / Next Appointment / Latest Journal Entry), and a horizontal Quick Actions row (Log Event / Request Swap)
- [x] Pure frontend chunk — no schema/API changes. All data comes from endpoints that already existed: `GET /children/:childId/custody-plan`, `/calendar`, `/family`, `/journal?limit=1`
- [x] Multi-child (Family tier) accounts get a `<select>` above the greeting to switch which child's dashboard is shown — same pattern already used on the Calendar/Journal tabs, since the Stitch mockup is single-child
- [x] Quick Actions deep-link into the Calendar tab (`?action=add-event` / `?action=swap`) instead of duplicating forms on the dashboard — `CalendarPage.tsx` now reads that query param once on load, opens the add-appointment form or scrolls the existing Request Swap card into view, then clears the param
- [x] Empty states covered: no custody plan yet, no upcoming appointment, no journal posts yet — each shows a short prompt instead of breaking, since these are all real states for a brand-new account
- [x] Verified in the cloud sandbox: clean `tsc --noEmit` for `apps/web`, `npm run build:web` succeeded
- [ ] **Needs verification on Charlie's machine**: visual check against the mockup with real seeded data (colors/spacing/photo scrim), and that both Quick Actions buttons actually land correctly on the Calendar tab

## QA + UX review (static, whole app)
- [x] 6-agent parallel review (senior QA tester + senior UX engineer lens) across every screen and route, compared against the Stitch mockups where they exist — full findings in `tasks/qa_ux_review.md`
- [x] All 5 Critical + every High/Medium/Low fixed — see "Fix pass" below
- [ ] This was a static read of the code only (no live DB in this sandbox) — Charlie's own click-through testing may surface more, especially timing/race-condition ones

## Fix pass — every qa_ux_review.md finding, + global header, + invite flow (2026-09-06)

Two new scope items came in alongside "fix everything in the report": a persistent header was missing across the whole app, and the invite flow was broken enough that testing shared-plan features with a second parent account wasn't possible. Both are fixed here too. Execution: shared/security-sensitive pieces (types, the invite flow, the header) done directly; the rest dispatched as 6 parallel agents, one per the review's area split, each fixing every finding in its own files only.

**Critical, all fixed:**
- [x] Invite-accept account-takeover hole — `POST /invites/:token/accept` now rejects (409) if an account already exists for the invited email instead of silently logging the submitter in as that account. New `POST /invites/:token/accept-as-me` (authenticated, email-matched) handles the "I already have an account" case properly instead.
- [x] Abandoned-checkout free Family upgrade — `requireActiveAccess` and the child-cap check now compute an `effectiveTier` that only honors a paid `tier` when `status` is `ACTIVE`/`TRIALING`; a `PENDING`/`PAST_DUE`/`CANCELED` subscription is treated as FREE for gating purposes regardless of what `tier` says.
- [x] Growth entries — added `PATCH`/`DELETE /children/:childId/growth-entries/:id`; fixed the child's headline height to recompute from the actual most-recent entry (by `measuredAt`) after every create/update/delete instead of blindly taking whatever was just posted; added inline edit/delete on the Growth page's Recent Logs.
- [x] Medical info + emergency contacts — added real add/edit/delete forms on both pages (backend CRUD already existed); contacts auto-derived from family members correctly stay non-editable.
- [x] Swap requests — added a "Pending swap requests" section on the Calendar tab with Approve/Decline, using the backend endpoints that already existed but had no frontend at all.

**New scope item — Global header:** `apps/web/src/components/Header.tsx` (new) + `AppShell.tsx` wiring. Full bar (logo/title/bell→Messages/avatar→Profile) on the 5 bottom-nav tab roots; a lighter back-chevron+title+avatar bar on the child sub-pages that had no chrome at all (profile/medical/contacts); renders nothing on pages that already had their own local back-button header (Billing/JournalPost/Lists/MessageThread/Notes), so nothing doubles up.

**New scope item — Invite flow, now actually testable end to end:** `GET /invites/:token` lets the accept page know up front whether a token is valid/expired/already-accepted and whether the invited email already has an account; a logged-in user can now open an invite link at all (previously hard-redirected to `/`); logging in mid-invite redirects back to finish accepting (`?redirect=`); phone/SMS invites were removed from the UI entirely rather than left half-working (they always 400'd on accept and the "sent!" toast was misleading) — email invites are the one real path, same console-logged accept URL as before.

**Everything else from the report, by area:**
- Auth/Onboarding/Profile: password show/hide toggle, push-state-stuck-loading fix, honest gender label, `aria-hidden` on decorative icons app-wide (fixed at the shared `Icon` component)
- Child/Medical/Growth/Contacts: `ChildProfilePage` edit affordance; growth chart single-point label/badge fix + horizontal scroll for dense logs; Recent Logs note truncation
- Dashboard/Calendar/Custody/Swap: fixed the calendar range query silently dropping events on the last day of any range (`lte` → exclusive `lt`); Dashboard "next appointment" now filters out past ones; "today" now computed in the viewer's local date, not UTC; Quick Actions deep-link now re-fires on repeat navigation; journal-card gradient scrim only shows with an image; chevron `aria-label`s; day-strip scroll-snap
- Journal + Media: `FAILED` media now shows a real error state instead of endless "Processing…"; feed now polls while anything's processing and stops once it isn't; "Load more" pagination; reaction button gets error handling + click-guard; post delete + comment edit/delete added; object-URL leak fixed; video badge; title truncation; client-side file-size check; real alt text
- Messaging/Lists/Notes: list-item claim race fixed with an atomic conditional update (409 on conflict); claimed items can now only be deleted by their claimer; thread header title now comes from a real `GET /threads/:threadId` instead of guessing from whichever message loaded first
- Billing/Push: added `POST /billing/cancel` + a Cancel button; `checkout=cancel` now shows a message instead of nothing; webhook no longer marks `PAST_DUE` on a merely-missing field; "Trial expired" now displays correctly instead of a stale past date; appointment-reminder job tightened from daily to hourly so the "day-before" lead time is consistently ~23–24h instead of 1–24h

**Left unfixed on purpose** (infra/ops, not code bugs): `MedicalInfo` encryption-at-rest (needs a real KMS decision), a real SMS provider, a real transactional email provider (`MailSender` still console-logs).

**Verified in the cloud sandbox**: `tsc --noEmit` clean across `packages/shared` and `apps/web` (zero errors, not just "same as before" — actually zero), `npm run build:web` clean, `apps/api`'s only errors are the same 33-error pre-existing missing-`@splitkid/db`-client cascade every chunk has shown (compared line-by-line, no new error classes introduced anywhere touched). Re-read the invite flow's backend once more by hand after the fact since it's security-sensitive.

- [ ] **Needs verification on Charlie's machine — this is a big pass, please actually click through it**: `npm run prisma:migrate` (no schema changes were needed this pass — worth double-checking nothing was missed), `npm run dev`, then at minimum: the full invite loop with a second browser/profile (send → grab the console-logged accept URL → accept, both as a brand-new account and, separately, log in as an existing account first and confirm accept-as-me works and a mismatched-email account correctly gets rejected with the log-out prompt); add/edit/delete a medical info entry and an emergency contact; add/edit/delete a growth entry and confirm "Current Sizes" tracks the actual latest measurement even after deleting the newest one; send a swap request from one account and approve/decline it from the other; try to abandon a QuickPay checkout and confirm you're NOT granted the paid tier; cancel a subscription; check the header renders correctly (and without doubling up) across every tab and sub-page.

## Follow-up fixes from manual testing (2026-09-06, after the pass above)

Charlie started clicking through the app and found two things the static review pass couldn't have caught:

**1. Medical page showed every calendar appointment, not just medical ones.** The Child Profile → Medical → Appointments section (built earlier this same day to replace a stale "not built yet" placeholder) pulled every `APPOINTMENT`-category calendar event — school events, activities, anything — because the data model had no medical/non-medical distinction at all. Root-cause fix, not a keyword filter: added a real `isMedical Boolean @default(false)` column to `CalendarEvent` (**schema change — needs `npm run prisma:migrate` on Charlie's machine**), threaded it through `CalendarEventDto`/`CreateCalendarEventRequest`, both backend routes that build that DTO (`calendarEvents.ts` and `calendar.ts` — there are two, and only fixing one would've left the bug half-fixed), a new "Medical appointment" checkbox on the Calendar tab's add-appointment form, and tightened the Medical page's filter to require it. Any appointments Charlie already created while testing will show `isMedical: false` by default and need re-adding (or a manual DB edit) with the checkbox now that it exists.

**2. Invite flow: "nothing happens when adding a co-parent, can't test sharing plan."** Two compounding problems, both fixed:
- The invite response already contained the accept token, but the UI only showed a toast and auto-navigated away — the actual accept link (still the only way to test this, since `MailSender` is console-log-only — see the earlier pass's "left unfixed on purpose") was never surfaced anywhere Charlie could act on it. `OnboardingInvitePage.tsx` now shows the invite link directly after sending, with a "Copy invite link" button, and waits for an explicit "Done" instead of auto-navigating out from under it.
- There was no way to invite a co-parent (PARENT-level access) after onboarding at all — the only post-onboarding entry point (Child Profile → "Invite Family Member") was hard-coded to `role: FAMILY`. Fixed by merging the invite flow into one "Invite Family" entry point with a relationship picker (Co-Parent, Grandparent, Aunt/Uncle, Sibling, Caregiver, Other Family Member) — a new `FamilyMemberType` enum, separate from the existing `AccessRole` permission enum. Only `CO_PARENT` maps to `PARENT`-level access; the mapping (`familyMemberTypeToRole`) is computed server-side, not trusted from the client, so a request can't claim `CO_PARENT` permissions while labeling itself something else. **Schema change — also needs `npm run prisma:migrate`**: added `familyMemberType FamilyMemberType?` to both `Invite` and `ChildAccess` (nullable — existing rows and the account owner's own row have none) so the "Family & Connections" list can show "Grandparent" instead of a generic "Family" tag.

**Verified in the cloud sandbox**: `tsc --noEmit` clean on `packages/shared` and `apps/web` (zero errors). `apps/api` shows the same 33 pre-existing `@splitkid/db`-missing-client errors as every prior chunk, same error class (implicit-any cascades) — confirmed none of the touched files (`calendarEvents.ts`, `calendar.ts`, `invites/index.ts`, `children/index.ts`) introduced a new error class.

- [ ] **Needs verification on Charlie's machine**: `npm run prisma:migrate` (two new nullable columns + one new enum this time — `CalendarEvent.isMedical`, `Invite.familyMemberType`, `ChildAccess.familyMemberType`), then: add a medical appointment via the new checkbox and confirm it (and only it) shows on the child's Health page; send a co-parent invite, confirm the link now shows on-screen with a working copy button, and complete the accept loop in a second browser/profile; send a non-co-parent invite (e.g. Grandparent) and confirm it only grants FAMILY-level access and shows the right label in "Family & Connections".

## Editable custody schedule + custom patterns (2026-09-06)

The custody schedule could previously only be set once (`CustodySetup.tsx`, two hard-coded presets) — no way to change it afterwards, and no permission check on who could set it at all.

- [x] `CUSTODY_PRESETS` (packages/shared/src/custody.ts) grew from 2 to 4: added 3-4-4-3 and a fixed 5-2 (weekday/weekend) split, alongside week-on/week-off and 2-2-3.
- [x] Added a custom pattern builder — any sequence of "this parent, this many days" blocks, since `resolveCustodyForDate` already supported arbitrary blocks/cycle lengths and the UI just never exposed it. New `describeCustodyPattern()` helper renders any pattern (preset or custom) as a plain-English summary.
- [x] `CustodySetup.tsx` now handles both create and edit: the Calendar tab shows a schedule summary card once a plan exists, with an Edit button that reopens the same picker pre-filled (detects if the current plan matches a known preset; falls back to the custom tab pre-filled with its actual blocks if not).
- [x] Permission gap closed: `PUT /children/:childId/custody-plan` now requires `PARENT` role (was previously any child access at all, including FAMILY members like grandparents) — both parents can edit, since neither has any special "creator" status; FAMILY members can still view.
- No schema change this time — `CustodyPlan.patternDays` was already a flexible JSON column, so **no `prisma:migrate` needed** for this one.

**Verified in the cloud sandbox**: `tsc --noEmit` clean on `packages/shared` and `apps/web`; `apps/api` shows the same 33 pre-existing `@splitkid/db`-missing-client errors as every prior chunk (same class, none new — including in the touched `custodyPlan.ts`). `npm run build:web` clean.

- [ ] **Needs verification on Charlie's machine**: as parent A, create a schedule; confirm parent B sees the same schedule and an Edit button, and can change it (try both a different preset and a custom pattern); confirm a FAMILY-role account (e.g. an invited grandparent) sees the schedule read-only with no Edit button, and gets a 403 if they hit the endpoint directly.

## Header consistency, full-page compose flows, media on posts, avatar photos (2026-09-06)

Five corrections after using the app:

- [x] **Static header everywhere in-app.** Root cause: `Header.tsx` only knew how to render for tab-root and child-subpage (profile/medical/contacts) routes — everywhere else (Billing, Journal comments, Shared List, Message thread, Notes) built its own non-sticky local back-button header (`arrow_back` icon, no blur/shadow, scrolled away with content), and `/messages` had no header at all. Fixed with a new `HeaderContext`/`useHeaderConfig` hook (`apps/web/src/lib/HeaderContext.tsx`) any page can call to feed the *same* sticky global header a title/back-target/optional right-side action; `Header.tsx` grew a third branch for it (`SubpageHeader` extracted so it's shared with the existing child-subpage branch), `AppShell.tsx` wraps its `<main>` in the new provider. All 5 pages plus `/messages` migrated. Scope: in-app pages only, by design — Welcome/Login/Signup/onboarding/invite-accept keep their own intentional pre-auth flow chrome.
- [x] **Messages compose on its own page, multiple recipients.** New `/messages/new` (`MessageComposePage.tsx`) replaces the old bottom-sheet picker on the Messages list — checkbox multi-select over every contact across all children (same fan-out-and-dedupe logic as before, just moved), submits to the *existing* `POST /messages/threads` unchanged (`memberUserIds` was already an array server-side — no backend change). Sticky header + scrollable list + a bottom bar that's pinned above `BottomNav` rather than under it.
- [x] **Journal compose on its own page, tag multiple children.** New `/journal/new` (`JournalComposePage.tsx`) replaces the `JournalComposer.tsx` modal (deleted — **please also delete `apps/web/src/components/JournalComposer.tsx` from your working copy if it's still on disk; the cloud sandbox couldn't reach your machine's shell to remove it directly, only write/replace files**). Checkbox multi-select over your children (at least one required) instead of being locked to one. **Schema change — a real one this time, needs `npm run prisma:migrate` and a manual backfill, see below.**
- [x] **Multiple photos/videos per journal post.** No backend change needed — `mediaAssetIds` was already an array-typed field and already attached everything it was given; the old modal only ever let you pick one file. The new compose page allows repeated picks, shows a removable chip per file, and uploads/attaches all of them.
- [x] **Profile photo (you) and child photo.** New `AvatarUpload.tsx` component (clickable circle, tap to pick a photo) wired into your Profile page and each child's profile page. New `PATCH /auth/me` and an extended `PATCH /children/:childId` accept a `profileImageMediaAssetId`; `MediaAsset` grew two new nullable/unique columns (`avatarForUserId`, `avatarForChildId`) so an avatar photo is viewable by the right people the same way journal photos already are (you, or anyone who shares a child with you; or anyone with access to that child). The header's own avatar bubble now shows your photo once set, instead of always just your initial.

**Schema change — needs `npm run prisma:migrate` (covers all three at once):**
1. `JournalPost.childId` (single child per post) was replaced by a join table, `JournalPostChild` (`journalPostId` + `childId`, unique pair) — this is what makes multi-child tagging possible. **Before running the migration, back up or export your dev DB's existing `journal_posts` rows' `childId` values** — the migration as generated by `prisma migrate dev` will very likely want to drop that column, which loses the old single-child association unless you either (a) let Prisma generate the migration, then hand-edit the generated SQL to also `INSERT INTO journal_post_children (id, "journalPostId", "childId") SELECT gen_random_uuid()::text, id, "childId" FROM journal_posts` *before* the `ALTER TABLE ... DROP COLUMN "childId"` line, or (b) just accept the loss if your dev data is disposable. Flagging explicitly since this is exactly the kind of thing that's silent and irreversible once applied.
2. `MediaAsset` gained `avatarForUserId String? @unique` and `avatarForChildId String? @unique` (both nullable, both no default) — no backfill needed, every existing row just gets `null` for both.

**Verified in the cloud sandbox**: `tsc --noEmit` clean on `packages/shared` and `apps/web` (zero errors). `apps/api` shows the same pre-existing `@splitkid/db`-missing-client error class as every prior chunk (all implicit-`any`/module-not-found, ~33-35 depending on exactly which lines changed — never a new error *class* introduced by this pass, including in every touched file: `journal.ts`, `journalComments.ts`, `journalReactions.ts`, `media/index.ts`, `auth/index.ts`, `children/index.ts`). `npm run build:web` clean. Caught and fixed by hand (tsc can't see it without a real Prisma client): the pre-existing journal-photo access check in `media/index.ts` still read `journalPost.child.access` — the old singular relation — after the schema split; updated to `journalPost.children[].child.access` (viewable by anyone with access to *any* tagged child). Hand-reviewed both avatar-swap transactions (`auth/index.ts`, `children/index.ts`) and the new multi-child permission check in `journal.ts`'s `POST /` — all three clear/verify before writing, so no race can leave two assets claiming one avatar slot or let someone tag a child they don't have access to.

- [ ] **Needs verification on Charlie's machine**: run `npm run prisma:migrate` (see backfill note above — decide before running whether to preserve existing journal posts' child association); compose a new message to 2+ recipients from `/messages/new` and confirm a group thread is created; compose a new journal post tagged to 2 children with 2+ photos, confirm it shows up under both children's journals sharing one comment thread; set a profile photo and a child's photo, confirm both show up (including in the header avatar bubble) and that a co-parent/family member can see the child's photo but a stranger can't; manually delete `apps/web/src/components/JournalComposer.tsx` if it's still present (dangling, no longer imported anywhere); click through every one of the 5 migrated pages (Billing, Journal comments, Shared List, Message thread, Notes) plus Messages and confirm the header now stays fixed while scrolling and looks visually consistent everywhere.

## Chunk 9 — Calendar sync (phase 2)
- [ ] Google Calendar OAuth + sync
- [ ] Outlook Calendar OAuth + sync

---

## Open items to confirm before/along the way
- GDPR: encryption at rest for `MedicalInfo`, data export/delete flow, retention policy
- BullMQ worker deploy: confirm systemd vs pm2 availability on the Plesk VM over SSH
- CI/CD: currently manual (`git pull` + build on the VM) — revisit once chunk 1 is proven

---

## Roles & Subscription Model (spec v1.3, 2026-09-14)

Source: `docs/roles_and_subscription_spec.md` v1.3 + `docs/implementation_prompt.md`
(the execution brief). Plan approved in-session; full design rationale and as-built
code references live in the session's plan file — this section is the live checklist.
Non-negotiable invariants for every phase below: I-1 (entitlement not transitive), I-2
(one trial per user, ever), I-3 (a child always has ≥1 coverage-eligible member),
coverage attaches to `PARENT`/`GUARDIAN` only, capabilities are absolute not
state-dependent, reads never gate on billing, never store *why* someone is a guardian.

### Phase 0 — Test infrastructure (prerequisite, not in the spec/brief) ✅
- [x] `apps/api`: added `vitest`, `supertest`, `@types/supertest`; `test` script (`vitest run`); `vitest.config.ts` (Node env, `fileParallelism: false` since integration tests share one real test DB)
- [x] Split `server.ts` into `app.ts` (`createApp()`, no `.listen()`) + a thin `server.ts` entrypoint, so tests mount the app with `supertest` without binding a port
- [x] Test DB: **not** `kidcom_test`/`DATABASE_URL_TEST` as originally sketched — the real local `.env` actually uses `splitkid`/`splitkid` creds (pre-existing naming drift from before the app/package rename to "kidcom"; `.env.example` still says `kidcom`). Used `splitkid_test`, a same-server sibling DB, created via `docker exec splitkid-dev-postgres-1 createdb -U splitkid splitkid_test` and migrated with `prisma migrate deploy`. `apps/api/src/testUtils/setupEnv.ts` derives `<db>_test` from whatever `DATABASE_URL` is actually configured (not hardcoded), so this works regardless of which naming a given machine ends up with
- [x] `apps/api/src/testUtils/db.ts` — `resetDb()`, truncates every table except `_prisma_migrations`, called in `beforeEach`
- [x] `packages/shared`: `vitest.config.ts` for pure-function unit tests (no DB/HTTP)
- [x] Root `package.json` gained a `test` script (`npm run test --workspaces --if-present`); README.md documents the one-time test-DB setup step
- [x] Proof: `GET /health` supertest passes against the real (test) Postgres DB; `packages/shared` unit tests pass against real existing exports (`isValidEmail`, `familyMemberTypeToRole` — used real exports instead of an invented placeholder, per "simplicity first"/no dead code); `npm run test` and `npm run typecheck` both clean from repo root; verified the real dev DB's row counts (2 users/2 children/3 child_access) are unchanged after the test run, confirming the test DB is fully isolated

### Phase 1 — D9: VAT disclosure ✅
- [x] `packages/shared`: `VAT_RATE`/`vatBreakdown()` — single source of truth for gross→net/VAT math, unit tested against the spec's §6.3 table figures exactly
- [x] VAT line (25%, derived from existing gross prices) on `BillingPage.tsx`'s Parents/Family plan cards — new `VatLine` component, gross price still the headline figure, unchanged
- [x] `apps/api/src/lib/emailTemplates/subscriptionReceipt.ts` (html + plaintext) — same shell pattern as `confirmEmail.ts`
- [x] `sendReceiptEmail()` in `billing/index.ts`, called from both the test-mode/non-production direct-activation branch of `POST /subscribe` and the real webhook's `accepted:true` branch — swallow-and-log on failure, same treatment as the existing verification email
- [x] `MemoryMailSender` added to `mailSender.ts`, active under `NODE_ENV=test` — lets tests assert on sent email content without a real SMTP server
- [x] No price change — gross stays 2900/5900/27500/55900 øre (asserted directly in tests)
- [x] Proof: `apps/api/src/routes/billing/index.test.ts` (3 tests) — Parents/monthly and Family/annual receipts assert exact net/VAT/gross figures matching spec §6.3; FREE tier asserts no receipt sent. `apps/web/src/routes/BillingPage.test.tsx` asserts the VAT line renders with the correct derived net price for both paid plans. `npm run test` + `npm run typecheck` clean from repo root
- Note: also added `apps/api/src/testUtils/auth.ts` (signup-and-get-a-session-agent helper) and extended `setupEnv.ts`/`resetDb()` to isolate session storage too (Redis logical DB 1, flushed per test) — needed once tests required an authenticated caller, not just an anonymous route

### Phase 2 — D1 + D3 (live defects, no model change) ✅
- [x] D1: `POST /invites` now checks `access.role !== "PARENT"` → 403 (`routes/invites/index.ts`) — closes the CO_PARENT-privilege-escalation hole
- [x] D3: removed the router-level `requireActiveAccess` blanket-block from `childrenRouter` (`routes/children/index.ts`) — per the finalized Free tier (spec §4.1), custody/journal/medical/growth/lists mutations are never gated purely by trial/tier status; the tier's only two real restrictions are the 1-child cap (already enforced in `POST /children`, untouched) and "no invites" (deliberately **not** yet enforced — see note below)
- [x] `middleware/billing.ts`'s `requireActiveAccess` left in place but unreferenced, with a comment explaining it's pending literal replacement by Phase 7's `requireChildEntitlement` — not deleted, since the brief's own Phase 7 description names it as the thing being replaced
- [x] **Scope note, decided during implementation, not silently**: did *not* add a "Free tier can't invite" gate in this phase, despite spec §4.1 listing it. Blocking all invites for Free-tier callers right now would break the existing first-invite-is-free onboarding flow (a brand-new organic signup inviting their co-parent immediately after creating their first child) with no paywall UX yet to explain why — that restriction depends on spec §2.2a's T2 trigger (inviting a 2nd adult raises `requiredTier`), which is genuinely Phase 7. Left a comment at the call site pointing at this.
- [x] Proof: `apps/api/src/routes/invites/index.test.ts` (4 tests) — a FAMILY-role (invited grandparent) `POST /invites` attempt gets 403 and creates no `Invite` row; a PARENT-role invite still succeeds; an invited user whose 30-day trial is set to the past is *not* blocked from a child mutation (PATCH), matching an organic signup's never-blocked behavior. `npm run test` + `npm run typecheck` clean from repo root; real dev DB row counts unchanged

### Phase 3 — `AccessRole` actually gates something (spec §1.4, existing PARENT/FAMILY enum) ✅
- [x] `apps/api/src/lib/permissions.ts` — `can(access, capability)` + `canViewMedicalInfo(access)` + `requireCapability(capability)` middleware; 11 capabilities encoded, generalizing the `custodyPlan.ts:44` inline-check pattern that used to be the only role check anywhere
- [x] `ChildAccess.medicalInfoAccess Boolean @default(false)` migration (applied to dev + test DBs) — FAMILY/Caregiver per-member opt-in
- [x] Wired into: `custodyPlan.ts` (edit), `medicalInfo.ts` (view = opt-in, edit = PARENT-only), `growthEntries.ts` (PARENT-only), `calendarEvents.ts` (create/edit/delete = PARENT-only — see scope note below), `swapRequests.ts` (create = not-Caregiver, approve = PARENT-only), `journal.ts` (post = not-Caregiver; comments/reactions deliberately left ungated per matrix), `listItems.ts` (add/manage = not-Caregiver; claim deliberately left ungated), `children/index.ts` (PATCH basic info = PARENT-only)
- [x] **New endpoint, didn't exist before**: `DELETE /children/:childId/family/:userId` — removes a member (PARENT-only caller); enforces I-3 (a child always keeps ≥1 PARENT) by refusing to remove the last one, tested via a real two-parent scenario, not just self-removal
- [x] Caregiver restrictions (9.5): `swap_request:create`, `journal:post`, `list_item:manage` denied for `familyMemberType === "CAREGIVER"` while a plain FAMILY member keeps them — see `CAREGIVER_DENIED` in `permissions.ts`
- [x] **Scope decisions, flagged not silent**: (1) `calendar_event:manage` denies FAMILY/Caregiver outright rather than building the "request" sub-workflow the matrix calls for (spec §1.4) — that's a real request/approve feature (like the existing `SwapRequest` flow) with no queue/UI today; denying is the safer default until a follow-up phase builds it. (2) Caregiver's "media: view only" is **not** enforced in `media/index.ts` — `?variant=original` is overloaded for actual video *playback* (a VIDEO asset's derivative is a poster frame, not a playable file), so blocking it would break video viewing entirely for Caregivers, which isn't the spec's intent; the practical effect (can't attach new media to a post) is already closed by the `journal:post` gate. (3) `emergencyContacts.ts` and `schedule.ts` (medical checkup occurrence toggling) are **not** gated — neither has a row in the §1.4 matrix, so adding a restriction there would be inventing policy the spec doesn't state.
- [x] Proof: `apps/api/src/lib/permissions.test.ts` — every capability × PARENT/FAMILY row from the matrix, plus an exhaustiveness check and dedicated Caregiver-override tests (19 tests, pure logic, no DB). `apps/api/src/routes/children/permissions.test.ts` — the same matrix wired into real HTTP routes against a real DB (10 tests): custody plan, calendar events, swap requests, child basic info, medical info opt-in, growth entries, journal post-vs-comment, lists add-vs-claim, member removal, and the I-3 last-parent invariant proven via a real two-parent scenario (not just a self-removal special case). `npm run test` + `npm run typecheck` clean from repo root; dev DB unchanged.
- Along the way: found and fixed **pre-existing schema drift** unrelated to this work — the migration folder doesn't fully describe the real dev DB's schema (`CalendarEvent.confirmable` and other columns exist in dev but in no migration file). Test DB rebuilding now uses `prisma db push` against current `schema.prisma`, not `migrate deploy` against migration history — see `tasks/lessons.md`. Also disabled the `/auth` rate limiter under `NODE_ENV=test` (the growing test suite's many real signups were tripping it within a single run) and fixed a Phase-2 test that happened to use a now-more-tightly-gated endpoint (child PATCH) as its "any mutation" example.

### Phase 4 — add `GUARDIAN` to `AccessRole` (9.3) + Guardian column ✅
- [x] Additive enum migration: `AccessRole` gains `GUARDIAN` (applied to dev DB via migrate deploy, test DB via `db push` — see `tasks/lessons.md`'s corrected workflow)
- [x] `packages/shared`'s `AccessRole` type updated to `"PARENT" | "GUARDIAN" | "FAMILY"` — let TypeScript's `Record<Capability, Record<AccessRole, boolean>>` exhaustiveness check in `permissions.ts` find every capability needing a GUARDIAN entry (11 compile errors, all fixed)
- [x] Guardian column: full parity with Parent on every record-editing capability (custody plan, calendar events, swap requests, child basic info, medical info edit, growth entries, journal post, list items) and medical info **view is unconditional** (no opt-in flag, unlike FAMILY) — the "10 Sep amendment" in spec §1.4
- [x] The asymmetry: added `member:invite_family_or_caregiver` (new capability — PARENT+GUARDIAN) and `member:remove_guardian` (new capability — PARENT only) alongside the existing two; Guardian can invite/remove FAMILY/Caregiver members but **not** invite/remove a PARENT and **not** remove another GUARDIAN
- [x] `routes/invites/index.ts`'s D1 gate now branches on the invite's *resolved target role* (`member:invite_or_remove_parent` if the invite would grant PARENT, else `member:invite_family_or_caregiver`) instead of a flat "PARENT only" — this is what actually lets a Guardian invite Family/Caregiver members while still blocking them from minting a co-parent
- [x] `routes/children/index.ts`'s member-removal endpoint now branches by the *target's* role (PARENT/GUARDIAN/FAMILY) to pick the right capability, replacing the Phase 3 placeholder comment
- [x] Fixed a real (if currently dormant) label bug in `emergencyContacts.ts`'s derived-contact naming (`role === "PARENT" ? "Parent" : "Family"` would have mislabeled a Guardian as "Family") — added a proper `ROLE_LABEL` map
- [x] **9.18 carve-out — deferred, not built:** the brief asks to "wire the shape into the tier-calculation path now," but no such path exists yet in the codebase (no `requiredTier()`, no `ChildCoverage` — those are Phase 7). There's nothing concrete to wire it into; Phase 7's `requiredTier()` build already includes the carve-out in its own scope. Noted here rather than inventing a throwaway placeholder formula.
- [x] Proof: `lib/permissions.test.ts` — full matrix extended to all three columns (27 tests: every capability × role, an exhaustiveness check, dedicated "Guardian = full parity except 4 people-management rows" tests, Caregiver-vs-Guardian interaction, medical-info view). `routes/children/permissions.test.ts` — 15 HTTP-level tests including Guardian editing the record, viewing medical info unconditionally, inviting a Family/Caregiver member, and the asymmetry proven three ways (can't invite a co-parent, can't remove a parent, can't remove a second real Guardian). `npm run test` + `npm run typecheck` clean from repo root; dev DB unchanged.

### Phase 5 — `RelationshipType` enum + migration (spec §1.3, R16) — the lossy step ✅
- [x] New 18-value `RelationshipType` enum (spec §8) replacing `FamilyMemberType`; `ChildAccess.relationship` is now **required** (was nullable `familyMemberType`) — every row, including the account-owner/direct-creator rows that used to be null, gets an honest value
- [x] **Mapping table used** (documented in full in the migration file's own header comment, `packages/db/prisma/migrations/20260914110000_relationship_type/migration.sql`):
  - `ChildAccess`/`Invite` role=PARENT rows → that user's own `User.parentRole` (FATHER/MOTHER/PARENT) — **deviated from the spec's literal "inviting user's counterpart" suggestion**, flagged not silent: every PARENT-role user (direct creator or accepted CO_PARENT invitee) already has their own self-declared `parentRole` on `User` (`AcceptInviteRequest.parentRole` is self-selected by the invitee, not inferred from a partner — confirmed by reading `routes/invites/index.ts`), so there's no "counterpart" to infer and the simpler direct mapping is strictly more accurate
  - role=GUARDIAN → `GUARDIAN` (no real rows existed yet)
  - `GRANDPARENT` → `GRANDMOTHER_PAT` (arbitrary, undecidable — no gender/side was ever stored; flagged loudly in the migration comment that real users must self-correct via the relationship picker)
  - `AUNT_UNCLE` → `AUNT`, `SIBLING` → `SISTER` (same reasoning, arbitrary defaults)
  - `CAREGIVER`/`OTHER` → themselves (exact, no ambiguity); `CO_PARENT` → `PARENT` (a position, not a relationship — spec §1.2)
- [x] **Dry run against a copy of the dev DB** (`splitkid_migration_dryrun`, created via `CREATE DATABASE ... WITH TEMPLATE splitkid`) — no prod DB exists yet, so this is explicitly the dev-DB dry-run the brief anticipated for that case
- [x] Dry-run report: `child_access` 3/3 rows preserved (all real rows were role=PARENT with `parentRole: PARENT`, so the arbitrary GRANDPARENT/AUNT_UNCLE/SIBLING defaults weren't actually exercised by this dataset — noted, not hidden); `invites` 2/2 rows preserved (both CO_PARENT → PARENT). Verified against the real per-row data before running for real, not just aggregate counts.
- [x] Applied to the real dev DB via `migrate deploy` (matched the dry-run exactly, confirmed by direct query); test DB resynced via `db push` (see `tasks/lessons.md` for why `migrate deploy` doesn't work on a `db push`-built database)
- [x] Full application-code cutover: `packages/shared` (`RelationshipType`, `RELATIONSHIP_TYPE_LABELS`, `relationshipTypeToRole` replacing `FamilyMemberType`/`FAMILY_MEMBER_TYPE_LABELS`/`familyMemberTypeToRole`), `lib/permissions.ts`, `middleware/childAccess.ts`, `routes/children/index.ts` (creator's `relationship` now derived from their own `parentRole`), `routes/invites/index.ts` (full rewrite of the create/preview/accept/accept-as-me handlers), `apps/web`'s `ChildProfilePage.tsx` (label display, now unconditional since `relationship` is never null) and `OnboardingInvitePage.tsx` (full 16-option relationship picker, `BROTHER`/`SISTER` deliberately excluded — spec 9.16 makes siblings parent-created, not invited)
- [x] Proof: `npm run test` (50 API + 10 shared + 2 web = 62 tests) and `npm run typecheck` clean from repo root after the full cutover; real dev DB re-verified post-migration (3/3 child_access, 2/2 invites, correct relationship values) matching the dry-run exactly

### Phase 6 — drop `User.parentRole` ✅
- [x] Migration dropped `User.parentRole` column and the `ParentRole` enum (dev DB via `migrate deploy`, test DB via `db push` — see the corrected workflow in `tasks/lessons.md`), only after Phase 5 was verified against real data
- [x] `packages/shared`: removed `ParentRole`/`PARENT_ROLE_LABELS`; `PublicUser`/`SignupRequest`/`UpdateProfileRequest`/`AcceptInviteRequest` no longer carry `parentRole` at all
- [x] **The real design work**: "what's your relationship to this child" moved from account-creation time to child-creation time, per spec §1.3's own recommendation ("signup shouldn't be asking are you a father or a mother before it knows whether there's a child"). `CreateChildRequest` gained an optional `relationship` field (restricted server-side to FATHER/MOTHER/PARENT until Phase 9's bootstrap-guardian flow exists — a non-parent value would be dishonest paired with today's always-PARENT-role creation), defaulting to the neutral `PARENT`. `OnboardingChildPage.tsx` gained an "I am this child's…" picker (Dad/Mom/Parent) in the same style as its existing Gender picker — no mockup covers this addition, but it's exactly what spec §1.3 calls for.
- [x] `apps/web/src/lib/parentLabel.ts` ("Dad's Time"/"Mom's Time" custody labeling) switched from the old account-level `ChildFamilyMember.parentRole` to the per-child `ChildFamilyMember.relationship` — a strict improvement (correctly handles someone who's Dad to one child and Uncle to another) discovered while tracing every `parentRole` usage before deleting the column
- [x] Removed the "I am the…" picker entirely from `SignupPage.tsx` and `ProfilePage.tsx`'s inline-edit form (no longer an account-level question); removed it from `InviteAcceptPage.tsx` too — the invitee's relationship was already fixed by the inviter's choice at invite-creation time, so accept now just displays it informationally ("Create your account to accept as Grandmother")
- [x] Proof: `npm run test` (50 API + 10 shared + 2 web) and `npm run typecheck` clean from repo root; `npm run build:web` (real production Vite build, not just typecheck) clean; real dev DB re-verified post-migration (2 users, 2 children, 3 child_access rows unchanged) and confirmed `parentRole` column is gone from `users`

### Phase 6a — access-grant analytics event (shipped now, after Phase 6 instead of with Phase 5 — see note) ✅
- [x] New `AccessGrantEvent` model — deliberately carries **no childId/userId/email**, so the table can never be joined back to a person at the schema level (stronger than "the query layer promises not to," which is what spec literally asks for): `relationship`, `inviterRelationship` (null for a bootstrap grant), `timeToAcceptMs` (null for a bootstrap grant), `createdAt`
- [x] `lib/accessGrantAnalytics.ts`'s `logAccessGrant()` — wired into `POST /children` (bootstrap grant), `POST /invites/:token/accept`, and `POST /invites/:token/accept-as-me` (skips logging when accept-as-me is a no-op on existing access, not a new grant)
- [x] Aggregate-only / minimum-cohort-10 / no-gender-derivation rules documented directly on the model in `schema.prisma` for whoever writes the first real query against this table (no dashboard/reporting UI exists yet to enforce this in code)
- [x] **Scope note, flagged not silently assumed done**: spec 9.20 requires the privacy-notice copy update to ship in the *same release* as this — that copy lives in an external document (`splitkid.com/privacy`, referenced from `lib/emailTemplates/layout.ts`'s footer link), outside this codebase's reach. This migration/instrumentation alone does not satisfy that requirement — confirm the copy update ships before this goes to production.
- [x] **Order note**: shipped after Phase 6 rather than with Phase 5 as the brief specified, since Phase 5/6's `User.parentRole` → `ChildAccess.relationship` migration needed to land and stabilize first — this event's `relationship`/`inviterRelationship` fields depend on that data model being final, not the version being migrated away from.
- [x] Proof: `apps/api/src/lib/accessGrantAnalytics.test.ts` (5 tests) — bootstrap grant logged correctly (no inviter, no delay); invite-accept grant logged with the *inviter's own* relationship and a real positive time-to-accept; accept-as-me does NOT double-log when the user already had access; a created row's field set is asserted exhaustively (proving no gender field exists to write into, not just that nothing currently writes one); the `data:` block passed to Prisma is asserted to contain no gender reference. `npm run test` (55 API + 10 shared + 2 web) + `npm run typecheck` clean from repo root; dev DB re-verified (unchanged row counts, new `access_grant_events` table present and empty as expected for pre-existing rows).
- Found and fixed a real bug while writing the proof: the three `logAccessGrant()` call sites were fire-and-forget (`void logAccessGrant(...)`), which raced the HTTP response and made the write's completion non-deterministic — switched to `await` since the function already can't throw past its caller (see `tasks/lessons.md`)

### Phase 7 — the entitlement engine (hinge of the release) ✅
- [x] `ChildCoverage` model added to schema (spec §8) — **population deliberately deferred to Phase 8**, flagged not silent: nothing in Phase 7's actual requirements needs a materialized table (gating is computed live from `ChildAccess`+`Subscription`+`User` trial fields on every request, so a sync bug in a stored table could never produce an incorrect gate); Phase 8's grace-period math is the first real consumer of the `since` column
- [x] `packages/shared/src/entitlement.ts` (pure, no DB — usable client-side too): `requiredTier(members, candidateOwnerId)` (spec §2.2 def. 3) — **discovered while implementing that this is owner-relative, not one global value per child**: the 9.18 carve-out ("a GUARDIAN-role member other than the covering subscription's own owner") means required tier must be evaluated from each candidate coverer's own perspective, since a lone guardian excludes *themselves* from their own count but not from anyone else's. `effectiveCoverageTier` (trial → FAMILY regardless of real subscription; else real tier if ACTIVE/TRIALING; else FREE) and `isSatisfied`/`satisfyingOwnerIds` (def. 4) built on top
- [x] `apps/api/src/lib/entitlement.ts`: `isChildSatisfied(childId)` (DB-wiring), `childSatisfyingParentIds(childId)` (exposed now for Phase 8), and `requireChildEntitlement` — the real per-child paid-tier gate, mounted after `requireChildAccess` on all 10 sub-router mount points plus `PATCH /:childId` in `children/index.ts`, replacing the blanket per-user gate Phase 2 removed. GETs never gated (reads never gate on billing, preserved).
- [x] I-2: `User.trialStartedAt`/`trialEndsAt` (matches spec §8's target schema exactly) — granted at account creation for **both** organic signup and invite-accept (previously only invited users got any trial at all), survives subscribe/cancel (tested explicitly), decoupled from `Subscription.status`/`trialEndsAt` (kept as a display/billing-history field only, documented as such in its own schema comment)
- [x] `PENDING_PARENT` custody-plan lock (spec 9.8): fully derived from existing data (`Child.createdAt` + a `role: PARENT` count) — no new schema. Locks `PUT .../custody-plan` once a child has gone 30 days with only one parent and no second one ever having joined; does **not** re-lock once a 2nd parent exists even if they joined late. Frontend needs no new code — `CustodySetup.tsx` already surfaces server error messages generically. **Deferred**: the "persistent banner" UI spec 9.8 mentions — functional lock is proven, the banner is a UI-polish item not built this phase.
- [x] Finalized Free tier (spec §4.1, confirmed final — already pulled forward in Phase 2's D3 fix, unchanged here)
- [x] Proof: `apps/api/src/routes/entitlement.test.ts` — **all three spec §3 scenarios**, literally: Scenario 1 (Emma stays satisfied by the original payer's plan across day 31 while Noah, uncovered, becomes unsatisfied — proving per-child beats per-user), Scenario 2 (adding a grandmother raises requiredTier to FAMILY identically regardless of which of two different people sends the invite — R2/§2.3, run as a parameterized two-iteration test), Scenario 3's sponsored-FAMILY-member half (a FAMILY-role grandmother's own plan/trial never covers the child she's sponsored on, even after her trial lapses) — the bootstrap-creator half explicitly stubbed with a comment pointing at Phase 9, not faked. `apps/api/src/lib/entitlement.test.ts` (7 tests) covers `isChildSatisfied` directly and the I-2/9.8 invariants. `packages/shared/src/entitlement.test.ts` (17 tests) covers the pure formula row-by-row including the 9.18 carve-out from both perspectives. `npm run test` (65 API + 27 shared + 2 web = 94 tests) + `npm run typecheck` + `npm run build:web` clean from repo root; dev DB unchanged throughout.
- Found and fixed a real bug while writing the scenario tests: my own test helper wasn't verifying invited users' emails after accept, silently causing downstream `requireVerifiedEmail`-gated calls (POST /children, POST /invites) to fail — added a shared `acceptInvite()` test helper that verifies immediately, matching the real app's actual flow

### Phase 8 — upgrade requests, coverage transfer, grace period (9.12) ✅
- [x] `UpgradeRequest` model (+ `UpgradeRequestStatus` enum: PENDING/RESOLVED/DISMISSED) — `POST /children/:childId/upgrade-requests` (PARENT-only, pushes every *other* PARENT-role member — "ask Charlie to upgrade") + `GET .../upgrade-requests` (list pending). Deliberately never moves money — the recipient still subscribes themselves via the existing `POST /billing/subscribe`.
- [x] 7-day grace period (spec 9.12, `GRACE_PERIOD_DAYS` in `lib/entitlement.ts`): `Subscription.pastDueSince` stamped once on the *first* PAST_DUE transition (not re-stamped on webhook retries), cleared on any recovery/fresh-checkout/cancel. A PAST_DUE subscription within 7 days of `pastDueSince` is treated as ACTIVE for entitlement purposes; past it, treated as FREE.
- [x] In-app + email notice on payment failure: `lib/paymentFailureNotice.ts`'s `notifyPaymentFailure()` — finds every child the payer covers, every *other* member of those children, and sends one grouped push+email per recipient (not one per child, even if they share several) naming the affected children and the grace deadline
- [x] §4.2 safety floor, **precisely scoped**: "custody-calendar writes" maps to exactly one route in this codebase's architecture — `PUT .../custody-plan` (custody days are *computed* from the plan, never stored as individual writes, so there's no separate "record a custody day" endpoint to also cover). Removed `requireChildEntitlement` from that route's mount entirely and added an inline PARENT-role-aware check in `custodyPlan.ts` instead — a PARENT's write is never gated on entitlement at all; a GUARDIAN still goes through the normal `isChildSatisfied` check. Flagged as a scope decision, not silently assumed: `calendar-events` (including its own `CUSTODY` category) stays under the normal blanket gate — those are ad-hoc calendar entries, not the custody schedule itself.
- [x] `GUARDIAN` deliberately excluded from the floor — proven by test, not just by the code reading that way (load-bearing for Phase 9's misuse-guard)
- [x] `GET /children/:childId/coverage` — the take-over-offer data surface: `satisfied`, `requiredTier`, `inGraceWindow` (true only while satisfaction is *borrowed* from someone's grace window — the "about to lapse" signal), `satisfyingParentIds` (who not to prompt, since they're already covering it)
- [x] Proof: `apps/api/src/routes/safetyFloor.test.ts` (4 tests) — (a) both parents' custody-plan writes keep working after the payer cancels and both trials expire, while an ordinary route (journal) is confirmed genuinely blocked first (so the floor test isn't trivially passing for the wrong reason); (b) a GUARDIAN's custody-plan writes *do* lapse once her trial ends and nothing else covers the child (constructed so requiredTier is FAMILY, not trivially satisfiable by the permanent Free floor); (c) `inGraceWindow`/`satisfied` are both true *during* the 7-day window (proving the offer surfaces before anything breaks, not after) and flip to false once the grace period actually runs out, with the safety floor proven independent of grace-window state throughout. A 4th test proves recovery clears `pastDueSince`. `npm run test` (69 API + 27 shared + 2 web = 98 tests) + `npm run typecheck` + `npm run build:web` clean from repo root; dev DB unchanged throughout.
- **Test-boundary note**: the grace-period/coverage tests simulate what the QuickPay webhook does (`status: PAST_DUE, pastDueSince: now()`) via direct DB writes rather than POSTing to `/billing/webhook` itself — reaching that route in test-mode would require fighting QuickPay's checksum verification (no test credentials configured, by design). The webhook's own checksum logic is pre-existing, unchanged infrastructure; what Phase 8 actually needed proven — the grace-period math and the coverage endpoint — is fully covered this way.

### Phase 9 — bootstrap guardian + claim/merge (9.9, 9.23) — fixes D5/D6, ships as one release ✅
- [x] Child-creation: creator declares relationship (`POST /children`'s `relationship` field now accepts the full `ALL_RELATIONSHIP_TYPES` taxonomy, not just FATHER/MOTHER/PARENT). **Open item 1 (brief §5), decided**: every non-parent `RelationshipType` may bootstrap-create — the spec doesn't gate which, so rather than let an arbitrary UI subset become de facto policy, all of them are offered (`OnboardingChildPage.tsx`'s relationship `<select>`, same full list `OnboardingInvitePage.tsx` already used for invitees, minus BROTHER/SISTER — Phase 10's minor-account flow, not a self-declarable relationship).
- [x] `isParentShapedRelationship()` (new, `packages/shared/src/index.ts`) is the one place this branch is decided: FATHER/MOTHER/PARENT → `role: PARENT` (unchanged); anything else → `role: GUARDIAN`, honest `relationship` stored, never `role: FAMILY` (FAMILY can never cover a child — spec §2.2 Consequence 1, would defeat the whole point of a bootstrap grant).
- [x] Bootstrap grant deliberately **not** routed through `relationshipTypeToRole` — confirmed that function stays invitee-onto-existing-child only, per the brief's explicit warning.
- [x] Required parent-contact capture (name + email and/or phone and/or explicit claim-link opt-in) when the creator's own grant resolves to GUARDIAN — `CreateChildRequest.parentContact`, validated server-side (400 if missing, 400 if neither email/phone/claim-link given). A `PARENT`-role `Invite` is created in the same transaction as the child, pre-filled, and emailed immediately if an email was given.
- [x] Shareable claim-link fallback reuses the *existing* `/invites/:token/accept` and `/accept-as-me` machinery unchanged (an `Invite` row with `email: null`) — no second invite mechanism built. `/accept` now accepts a caller-supplied `email` when `invite.email` is null; `/accept-as-me` now allows any logged-in user (not just an email match) to accept when `invite.email` is null.
- [x] Claim/merge (`apps/api/src/lib/claimMerge.ts`, new): `findClaimableChild()` matches by name (case-insensitive) + birthday, scoped to children the accepting user already **PARENTs** (never a FAMILY/GUARDIAN grant elsewhere). `mergeChildAccessInto()` moves every other member's `ChildAccess` onto the real child and deletes the duplicate — access-only, explicitly not content (journal/media/medical/custody-plan on the duplicate is lost, flagged in the code comment as a scope limit, safe for the realistic "caught quickly" timing this is built for). Wired into `/accept-as-me` only (the only path where the acceptor is already a known, logged-in user who could already have the real child).
- [x] `isCustodyPlanLockedPendingParent` corrected: was `parentCount !== 1 → false`, i.e. already exempted 2+ parents, but a fresh read confirmed it did *not* yet exempt the **zero**-parent case a bootstrap child starts in. Fixed (still `parentCount !== 1 → false`, which now correctly also catches 0). **Open item 2 (brief §5), decided**: per spec §2.2b's reasoning — the lock exists to stop one home unilaterally cementing a schedule before the *other* home is present, which presumes a parent already exists to be overridden; a bootstrap child has none, so there's nothing to protect against yet. No reason surfaced during implementation to disagree with the spec's "no."
- [x] No automatic step-down when a real parent joins — accepting the parent invite/claim-link only ever *adds* a PARENT row; the bootstrap guardian's own GUARDIAN row is untouched (removal, if wanted, is the existing explicit `DELETE /children/:childId/family/:userId`, unchanged).
- [x] D6 test: a genuine parent already at their 1-child PARENT-tier cap can still bootstrap-create further children as GUARDIAN (cap bypass only applies to bootstrap grants), and after 3 such bootstrap grants her PARENT-role row count is still exactly 1 — the cap only ever counted genuine parents.
- [x] **Genuine discovery, not a bug**: wrote the "misuse check" proof exactly as the brief describes it ("trial lapses, no parent/subscription → write access actually stops") and it failed — a solo bootstrap child (she's its only member) has `requiredTier = FREE` from her own perspective (the 9.18 carve-out's formula needs 2+ members to ask for anything above FREE), and FREE always self-satisfies, so her access does **not** stop, matching "a lone organic parent on Free always satisfies their own single child" exactly. Verified this is the entitlement engine working as designed (already covered by an existing Phase 7 test for the organic-parent case), not a Phase 9 gap — corrected the test to assert the real behavior and documented why in `tasks/lessons.md`. The actual backstop for mass solo-bootstrap-creation is Phase 10's fair-use cap (9.10), not entitlement lapsing — noted directly in the test's comment so this isn't silently lost.
- [x] Proof: `apps/api/src/routes/children/bootstrapGuardian.test.ts` (9 tests — bootstrap-grant role/validation, D6 cap isolation, claim/merge with and without a match, full Scenario 3 walkthrough incl. the corrected misuse-check finding above) + `apps/api/src/lib/entitlement.test.ts`'s new PENDING_PARENT zero-parent case (1 test). `OnboardingChildPage.tsx` rebuilt: full relationship `<select>` (was a 3-option Dad/Mom/Parent picker), conditional parent-contact section when a non-parent relationship is chosen, and a claim-link share screen for the no-email case (mirrors `OnboardingInvitePage.tsx`'s existing unsent-link pattern). `npm run test` (79 API + 27 shared + 2 web = 108 tests) + `npm run typecheck` + `npm run build:web` clean from repo root; dev DB migration status confirmed up to date (`prisma migrate status`) — Phase 9 needed no schema change at all, request/response DTOs and logic only.

### Phase 10 — soft-delete, minor-account flag, fair-use caps ✅
- [x] `Child.deletedAt` (soft delete, no cascade — 9.11's "content stays with the child" means there was never a deletion cascade to add) + `ChildDeletionRequest` model (spec 9.21/§1.4a.4): all-`PARENT`-confirm, `GUARDIAN`-fallback-if-none. **Deliberately live, not snapshotted**: `requiredConfirmerIds(childId)` (`apps/api/src/lib/deletion.ts`) recomputes the current PARENT (or GUARDIAN, if none) set on every read/confirm/cancel/restore rather than freezing it when the request opens, so a member who joins or leaves mid-request is picked up correctly. A solo confirmer (lone parent, or a lone guardian with no parent ever having joined) executes immediately — nothing to wait on. `GET/POST/DELETE .../delete-request` + `POST .../restore` (`apps/api/src/routes/children/deletion.ts`), mounted with no `requireChildEntitlement` (deletion/restore is account-control, not a paid feature — a lapsed payer must still be able to delete their own child's record).
- [x] Explicit test that the gaming path is closed: `deletion.test.ts`'s "gaming path closed" test proves a `GUARDIAN` cannot remove the child's only `PARENT` (`member:invite_or_remove_parent` is `PARENT`-only, not just "not the last one" — Phase 3's existing matrix already closes this, proven here specifically in the deletion context) and therefore can never become the sole required confirmer.
- [x] Sibling minor-account flag (9.16): `ChildAccess.isMinorMember` (a flag, not a new `AccessRole`, paired with `role: FAMILY`) — `POST /children/:childId/family/minor` (`children/index.ts`), PARENT-only, creates the sibling's own `User` + `ChildAccess` directly (random unusable password hash — the parent manages this on the child's behalf; a real "claim your account" flow for the minor is out of scope here) rather than an email invite. `POST /invites` now explicitly refuses `BROTHER`/`SISTER` (400) — closes the actual gap (the UI already omitted them from its picker, but the route itself still accepted them). `lib/permissions.ts`: `MINOR_MEMBER_DENIED` set (`swap_request:create` — the one FAMILY-allowed capability outside "journal, media, lists"; every other restricted capability was already `FAMILY: false` in the matrix) + `canViewMedicalInfo` now denies a minor member absolutely, even if a parent opts them into `medicalInfoAccess` (9.16's "no medical info" is not subject to the normal per-member toggle — putting another child's Art. 9 health data on a minor's account is exactly what this prevents).
- [x] Soft fair-use caps (`apps/api/src/lib/fairUseCaps.ts`, spec 9.10): `MAX_CHILDREN_PER_OWNER = 10` (counts PARENT+GUARDIAN `ChildAccess` rows for the owner — checked in `POST /children`, before the FREE-tier-specific 1-child cap, and applies to every tier and every creation path, bootstrap included), `MAX_MEMBERS_PER_CHILD = 15` (checked in `POST /invites` at creation time and again in `/accept`/`/accept-as-me` at actual-grant time, since membership can grow in between; also enforced in the new minor-member route). Refuses with a distinct support-contact message ("contact support@kidcom.app"), asserted in the proof test to *not* contain the ordinary upsell wording — a fair-use nudge, not a paywall.
- [x] Proof: `fairUseCaps.test.ts`'s first test fires the 10-child cap via **mass bootstrap-creation specifically** (9 fabricated bootstrap `GUARDIAN` grants + a 10th real one via the API, both bootstrap and a plain parent-shaped 11th correctly refused) — this is also the actual backstop for the gap Phase 9's own proof surfaced: a solo bootstrap child stays entitlement-satisfied at FREE tier forever (see `bootstrapGuardian.test.ts`'s corrected Scenario 3 test + the matching `tasks/lessons.md` entry), so this cap, not billing, is what catches mass solo-bootstrap-creation. Two more tests cover the 15-member cap at invite-creation and at accept-time separately (proving the re-check, not just the first gate, actually blocks a late-arriving race).
- [x] `deletion.test.ts` (6 tests) + `minorMember.test.ts` (4 tests) + `fairUseCaps.test.ts` (3 tests) = 13 new tests. `npm run test` (92 API + 27 shared + 2 web = 121 tests) + `npm run typecheck` + `npm run build:web` clean from repo root; new migration `20260914130000_soft_delete_minor_member` applied to dev via `migrate deploy`, test DB synced via `db push`; dev DB migration status confirmed up to date (`prisma migrate status`) throughout.
- **Lesson from this phase** (`tasks/lessons.md`): two deletion tests initially failed deterministically on a mixed-case fixture email (`parentA@example.com`) — not a bug in the app, but in the test itself: the server lowercases email at signup, and the test helper's email-lookup compares against the originally-typed string. Fixed by using all-lowercase fixture emails, documented so it isn't rediscovered.

### Definition of done (review section)

- [x] **Every phase's stated proof attached.** Phases 0–10 each have a dated ✅ entry above naming the specific test file(s)/run, not just "implemented." Final state: `npm run test` = **92 API + 27 shared + 2 web = 121 tests**, `npm run typecheck` and `npm run build:web` clean from repo root, dev DB migration status confirmed up to date (`prisma migrate status`) after every schema-touching phase.

- [x] **All three spec §3 scenarios pass as integration tests, Scenario 3 fully.** `apps/api/src/routes/entitlement.test.ts` (Scenarios 1 & 2, Phase 7) + `apps/api/src/routes/children/bootstrapGuardian.test.ts`'s "Scenario 3 (full, Phase 9)" test (the bootstrap-creator half, closing the deliberate stub the Phase 7 version left).

- [x] **Every invariant in brief §1 has ≥1 test that fails if violated:**
  - I-1 (entitlement not transitive): `packages/shared/src/entitlement.test.ts` "FAMILY-role members never cover anything (Consequence 1)..." + `entitlement.test.ts`'s Scenario 3 (a sponsored FAMILY member's own subscription never covers the child she's sponsored on, even post-trial).
  - I-2 (one trial per user, ever, on User): `apps/api/src/lib/entitlement.test.ts` "I-2 (spec §2.2/§4.3) — trialStartedAt is set once, at account creation, and never changes" (survives subscribe + cancel).
  - I-3 (a child always has ≥1 coverage-eligible member): `apps/api/src/routes/children/permissions.test.ts` "I-3: the sole remaining parent can't remove themselves, but can once a co-parent exists."
  - Coverage attaches to PARENT/GUARDIAN only, never FAMILY: same `entitlement.test.ts` (shared) test as I-1 above.
  - Capabilities are absolute, not state-dependent: `lib/permissions.ts`'s `MATRIX` is a static role→boolean table with no billing/trial input at all (structural, not just tested) — exercised row-by-row by `lib/permissions.test.ts` (27 tests) + `routes/children/permissions.test.ts` (15 tests).
  - Reads never gate on billing: added directly this review pass — `routes/entitlement.test.ts`'s Scenario 1 test now asserts Noah's `GET .../journal` and `GET /children/:childId` both stay 200 in the exact same moment his `POST .../journal` gets a 403 (previously true by code inspection of `requireChildEntitlement`'s GET early-return, but not proven by a dedicated assertion until now).
  - Never store *why* someone is a guardian: structural, not a runtime-testable property — `ChildAccess`/`Invite` have no placement/case-number/reason field anywhere in `schema.prisma`, called out explicitly in that model's own comment (verified by inspection each time the schema was touched this session, not just once at the start).

- [x] **D1–D9, closure status honestly reported, not all claimed done:**
  - D1 (any-`ChildAccess` invite escalation) — closed, Phase 2, `routes/invites/index.test.ts`.
  - D2 (nothing branches on `AccessRole`) — closed, Phase 3, `routes/children/permissions.test.ts`.
  - D3 (invited users treated worse than organic signups) — closed, Phase 2, `routes/invites/index.test.ts`.
  - D4 (no lifetime trial check, chained trials) — closed by construction once Phase 7 moved the trial clock onto `User` (set only at the two account-*creation* call sites, never on repeat accept) + I-2's test above.
  - D5 (creator always gets `PARENT`) — closed, Phase 9, `bootstrapGuardian.test.ts`.
  - D6 (child cap counts non-parents after D5) — closed, Phase 9, `bootstrapGuardian.test.ts`'s dedicated D6 test.
  - D9 (VAT disclosure) — closed, Phase 1, `BillingPage.test.tsx` + the subscription-receipt test.
  - **D7 (abandoned `PENDING` QuickPay checkout, no reconciliation job) and D8 (`BILLING_TEST_MODE` production bypass needs a startup log + dashboard banner) — NOT closed.** Neither was ever in `docs/implementation_prompt.md`'s 10-phase build order (confirmed by re-reading the phase list — only D1/D3/D5/D6/D9 are named across it), and this session followed that order without adding scope beyond it. Both remain exactly as flagged in the spec's defect table (`routes/billing/index.ts`'s own comments at the `PENDING`-status lines already document D7; D8 is undocumented in code beyond the `config.billingTestMode` branch's comment). Flagging here rather than silently marking D1–D9 "all closed" — these two need their own follow-up pass before real billing goes live, per the spec's own read of D8's severity ("one env var between you and giving the product away").

- [x] **Two open items from brief §5, decided and stated, not silently resolved:**
  1. *Which relationships may bootstrap-create a child* — decided: **every non-parent `RelationshipType`**, not an arbitrary UI subset (`isParentShapedRelationship()` in `packages/shared/src/index.ts` is the one place this branches; `OnboardingChildPage.tsx`'s picker offers the full taxonomy).
  2. *Whether `PENDING_PARENT` should lock the custody plan for a bootstrap guardian* — decided: **no**, per spec §2.2b's own reasoning (the lock exists to stop one home unilaterally cementing a schedule before the *other* home is present, which presumes a parent already exists to be overridden — a bootstrap child has none). `isCustodyPlanLockedPendingParent` was corrected mid-Phase-9 to actually exempt the zero-parent case (it previously only exempted 2+ parents), proven by `lib/entitlement.test.ts`'s dedicated zero-parent test. No reason surfaced during implementation to disagree with the spec's "no."

- **One more finding worth carrying forward, surfaced by Phase 9's own proof (not asked for by the brief, but load-bearing for Phase 10's design):** a solo bootstrap-guardian child (she's its only member) stays entitlement-satisfied at FREE tier *forever* — `requiredTier` only rises above FREE once a child has 2+ members, so her one-time trial lapsing never locks her out of a child nobody else ever joined. This isn't a gap: it's the same property that already makes Free tier work for a lone organic parent (spec §4.1), just newly visible once GUARDIAN could be the only role on a child at all. The real backstop for the mass-creation abuse pattern this could otherwise enable is Phase 10's 10-child fair-use cap (9.10), proven in `fairUseCaps.test.ts` to fire specifically via mass bootstrap-creation, not just a large legitimate family. Documented in `tasks/lessons.md` so it isn't rediscovered as a "bug" in some future session.

### Pre-commit/deploy readiness review (post-Phase-10 pass)

Requested separately, after Phase 10 shipped: verify the branch is actually safe to commit,
push, and deploy — not just that the phases are done. Found and fixed one real, pre-existing
gap; confirmed everything else clean.

- [x] **Full production build**, not just `tsc --noEmit`: `npm run build` (shared → `prisma generate` → `apps/api`'s real `tsc` → `apps/web`'s `vite build`) — clean from a fully clean `dist/`.
- [x] **Smoke-tested the actual compiled `dist/server.js`** (not vitest/ts-node): booted it against local Postgres/Redis, hit `/health` (200), signup (201, real user created), the new Phase 10 routes (`family/minor`, `delete-request` — both correctly 403 under the real auth/verification gate rather than 404/500), and an unknown route (404). Cleaned up the smoke-test user afterward.
- [x] **Found a real deploy-blocking gap, not present in any prior phase's testing**: every earlier phase's dev-DB check only ran `migrate deploy` against the *already-migrated* dev database, which can't reveal whether the full migration history applies cleanly to a genuinely fresh one. Running it against an actual freshly-created throwaway database surfaced pre-existing, undocumented `calendar_events` schema drift (see `tasks/lessons.md`'s "The migration history doesn't fully describe the real dev DB") that had never been captured as a migration file — a first-time deploy would have 500'd on its first calendar-event request. Fixed with a new backfill migration (`20260908222540_calendar_event_checklist_confirmation`), written **idempotently** (not a one-shot + manual `migrate resolve`) so it's correct whether or not the real production database already secretly has this same drift — proved both directions by actually constructing each starting state and running `migrate deploy` against it, not by inspection alone. Dev DB re-verified drift-free (`prisma migrate diff` → empty) afterward.
- [x] **Asked, not assumed, whether production data is at risk**: `DEPLOYMENT.md` + git history show a real configured production target (`kidcom.org`) with prior deploy/bugfix commits, and Phase 5's `RelationshipType` migration (this session, dev-DB dry-run only per that phase's own entry) is genuinely lossy — GRANDPARENT/AUNT_UNCLE/SIBLING rows get an arbitrary relabel, `User.parentRole` is dropped permanently. Asked directly rather than guessing either way: **confirmed by the user that production currently holds no real/disposable data** — this migration carries no real-world data-loss risk on this deploy.
- [x] Full test suite + typecheck re-verified clean after the migration fix (121/121, all 3 workspaces).
- [x] Diff scanned for secrets/credentials — none found. `.gitignore` correctly excludes `.env`, `dist/`, `node_modules/`, the generated Prisma client. All untracked files are legitimate source/test/migration files.
- [x] `local master` confirmed identical to `origin/master` (fetched, compared) — nothing to reconcile before pushing.
- **Non-blocking items noted, not fixed (pre-existing, out of this session's scope):**
  - `apps/api`'s `tsconfig.json` has no test-file exclude, so `*.test.ts` compiles into `dist/` alongside real server code (harmless at runtime — nothing `require()`s them — but it does mean `vitest`/`supertest` need to stay resolvable at build time; pre-existing since Phase 0, not something this session's Phase 9/10 work introduced).
  - `apps/web/tsconfig.tsbuildinfo` is a tracked build-cache file (predates this session) — shows a spurious one-line diff on every build; cosmetic only.
  - D7/D8 (abandoned QuickPay `PENDING` checkouts, `BILLING_TEST_MODE` production bypass) remain open, as already flagged above — unrelated to this review, carried forward from the phase-completion review.
  - `support@kidcom.app` (the fair-use-cap message's contact address) is hardcoded, not env-configurable — confirm that inbox exists and is monitored before this ships, or it's a dead-end for anyone who actually hits the cap.

---

## Post-launch backlog (billing hygiene, product gaps, compliance) — 2026-09-14

Full context, per-phase rationale, and design decisions live in the plan-mode file for
this session; this section is the live checklist. User triage, verbatim scope: **Fix**
on Phases A-K below; **Leave for now** on D8 (`BILLING_TEST_MODE` banner) and confirming
the `support@kidcom.app` inbox, both until production is promoted; **Ignore** real
SMS/email provider; **Keep open, no action** on Google/Outlook calendar sync. Two
decisions the user made directly: privacy-notice copy gets drafted here and published by
the user to the external site (no in-app page); MedicalInfo encryption is app-level field
encryption (not disk-level).

- [x] **Phase A** — Claim/merge content migration ✅. `mergeChildAccessInto` (`apps/api/src/lib/claimMerge.ts`) now reassigns `journalPostChild`/`medicalInfo`/`growthEntry`/`emergencyContact`/`custodyPlan`/`calendarEvent`/`swapRequest`/`listItem`/`upgradeRequest` onto the target child before deleting the duplicate, and clears `MediaAsset.avatarForChildId` (fixing a latent FK-constraint bug — that column has no `onDelete` clause, so a duplicate with an avatar would have thrown on `tx.child.delete()` before this fix). Deliberately excludes `childScheduleOccurrence` (`@@unique([childId, templateId, sequence])` risks a real collision since both children likely auto-generated the same template occurrence; it's regenerable progress-tracking state, not authored content) and `childDeletionRequest` (moot on a record about to be deleted — cascades normally). Proof: `bootstrapGuardian.test.ts`'s new test creates real journal/medical/custody-plan content plus a fabricated avatar on the duplicate via the actual API/GUARDIAN capabilities, merges, and asserts every piece landed on the real child and the avatar FK was cleared not carried over. `npm run test` (93 API) + `npm run typecheck` clean.
- [x] **Phase B** — Relationship self-correction ✅. `PATCH /children/:childId/family/:userId { relationship }` (`children/index.ts`) never touches the `role` column — only `relationship`, a display label — so the only real escalation risk found was narrower than "any role change": `CAREGIVER` is the one relationship value with an actual permission consequence (spec 9.5's `CAREGIVER_DENIED` set), so a self-edit specifically can't toggle into/out of it (a parent/guardian with standing authority over the member still can). Separately enforces `isParentShapedRelationship(new) === (target.role === "PARENT")` for data integrity (every PARENT-role row is invariantly parent-shaped by construction). Same capability tiering as the existing DELETE route, plus a self-edit allowance. UI: an edit-pencil affordance on `ChildProfilePage.tsx`'s Family & Connections rows, shown per the same authority rules, offering only relationship values that keep the row's current role. Proof: `apps/api/src/routes/children/relationshipEdit.test.ts` (5 tests — same-role self-correction, the parent-shaped escalation attempt rejected, a PARENT's own relationship staying parent-shaped even for themselves, the Caregiver self-toggle rejection with a parent able to do it instead, GUARDIAN-can-edit-FAMILY-not-PARENT). `npm run test` + `npm run typecheck` + `npm run build:web` clean.
- [x] **Phase C** — Caregiver calendar-event request/approve workflow ✅. New `CalendarEventRequest` model (migration `20260914181337_calendar_event_requests`, reuses `SwapRequestStatus` rather than a duplicate enum) + `apps/api/src/routes/children/calendarEventRequests.ts`, a close sibling of `swapRequests.ts` — `GET/POST /children/:childId/calendar-event-requests`, `PATCH /:id` (approve creates the real `CalendarEvent` in the same transaction, same not-self-approve guard). Two new capabilities in `lib/permissions.ts`: `calendar_event_request:create` (PARENT/GUARDIAN/FAMILY, denied for Caregiver and minor members — same treatment as `swap_request:create`) and `:approve` (PARENT/GUARDIAN only). Added to claim/merge's content-migration list (Phase A) since it's a new child-scoped model. UI: `CalendarEventRequestCard.tsx` (close sibling of `SwapRequestCard.tsx`) + a "Pending event requests" section in `CalendarShell.tsx`, same shape as the existing swap-request approve/decline list. Proof: `calendarEventRequests.test.ts` (5 tests — create→approve creates the real event, decline creates nothing, self-approve blocked, Caregiver denied but plain FAMILY allowed, FAMILY can't approve) + `permissions.test.ts`/`minorMember.test.ts` extended for the two new capabilities. `npm run test` (106 API + 27 shared + 2 web = 135) + `npm run typecheck` + `npm run build:web` clean.
- [x] **Phase D** — `PENDING_PARENT` persistent banner ✅. `getCustodyPlanLockStatus(childId)` (`apps/api/src/lib/entitlement.ts`, `isCustodyPlanLockedPendingParent` now just calls it) returns `{ locked, daysUntilLocked }` — `daysUntilLocked` is `null` whenever the lock condition doesn't apply at all (0 or 2+ parents), not "0 days." Exposed on `GET /children/:childId/custody-plan` (new `CustodyPlanStatusResponse` shared type). New generic `apps/web/src/components/Banner.tsx` (nothing reusable existed — `InstallPrompt.tsx` was the closest precedent but is install-specific) wired into `CalendarShell.tsx`, shown only to a `PARENT` viewer (the only role that could act on it) with copy framed around the actual constraint ("custody scheduling needs two homes") rather than implying anything is broken for a deliberately single-parent household — the mechanism can't tell the two cases apart, so the copy doesn't try to. Proof: `apps/api/src/lib/entitlement.test.ts` (2 new tests — `daysUntilLocked` null at 2 parents, counts down from 30 then flips to `locked:true`/`daysUntilLocked:0` past the threshold) + `apps/web/src/routes/calendar/CalendarShell.test.tsx` (3 tests, new — banner shows for a PARENT with a live countdown, hidden once a 2nd parent exists, hidden for a non-PARENT viewer even when the lock condition applies). `npm run test` (108 API + 27 shared + 5 web = 140) + `npm run typecheck` + `npm run build:web` clean.
- [x] **Phase E** — D7: QuickPay reconciliation ✅. New `quickpay.getSubscription()` wrapper (`GET /subscriptions/:id`, the piece that was missing — no existing call could check a stuck subscription's real state). `apps/api/src/lib/billingReconciliation.ts`'s `reconcilePendingSubscriptions()` (unit-testable in isolation, no BullMQ/Redis needed) finds `status: PENDING` rows whose `updatedAt` is >24h old (never touches a checkout genuinely in progress), and for each: self-heals to `ACTIVE` if QuickPay actually confirms it (a missed webhook, not abandonment) or reverts to `tier: FREE, status: ACTIVE` (undoing the premature tier bump) if QuickPay says it was never completed or the lookup fails/404s. New `reconcile-subscriptions` queue/worker in `worker.ts`, same idempotent-registration pattern as the existing `renew-subscriptions` job, daily at 03:30 (just after renewals). Proof: `billingReconciliation.test.ts` (4 tests, mocking `quickpay.getSubscription` via `vi.spyOn` — same "simulate the external call, don't fight real credentials" approach `safetyFloor.test.ts` already uses for the webhook — reverts a real abandonment, self-heals a missed webhook, leaves a fresh in-progress checkout untouched, treats a lookup failure as never-completed). `npm run test` (112 API + 27 shared + 5 web = 144) + `npm run typecheck` + full `apps/api` build clean.
- [x] **Phase F** — Password reset ✅. Confirmed nothing existed beforehand (`change-password` required an active session + the current password). New `PasswordResetToken` model (migration `20260914182804_password_reset_tokens`), exact same shape as `EmailVerificationToken` (hash-only, single-use, delete-and-recreate on re-request) but a tighter 1h TTL, not 24h — a password change is more sensitive than an email confirmation. `apps/api/src/lib/passwordReset.ts` mirrors `emailVerification.ts`; `POST /auth/forgot-password` (always 204 regardless of whether the email exists — no account-enumeration leak) + `POST /auth/reset-password` in `routes/auth/index.ts`. New email template `emailTemplates/passwordReset.ts`. Frontend: `ForgotPasswordPage.tsx` + `ResetPasswordPage.tsx`, "Forgot password?" link added to `LoginPage.tsx`, both wired into `App.tsx`'s logged-out route branch only (a locked-out user has no session). Proof: `apps/api/src/routes/auth/passwordReset.test.ts` (5 tests — full reset flow with the old password rejected/new one working, a used token can't be reused, no-enumeration-leak on a non-existent email, an expired token rejected, re-requesting replaces rather than accumulates). `npm run test` (117 API + 27 shared + 5 web = 149) + `npm run typecheck` + `npm run build:web` clean.
- [x] **Phase G** — MedicalInfo app-level field encryption ✅ (user's explicit choice over disk-level). New `apps/api/src/lib/medicalEncryption.ts` — AES-256-GCM, key derived via SHA-256 from `MEDICAL_INFO_ENCRYPTION_KEY` (any-length input, same "required with a dev-only fallback" shape as `SESSION_SECRET`; documented in `.env.example` and `DEPLOYMENT.md`). Encoded as `iv:authTag:ciphertext` (base64) in the existing `String`/`String?` columns — no schema change. Wired into `medicalInfo.ts`'s create/update (encrypt) and `toDto` (decrypt) — the API's own response shape/callers are unchanged, encryption is invisible above this one file. No data existed worth backfilling (disposable dev data, same precedent as earlier this session). Proof: `lib/medicalEncryption.test.ts` (4 tests — round-trip, random-IV-per-call, a tampered ciphertext fails to decrypt via GCM's auth tag rather than returning garbage, nullable passthrough) + `routes/children/medicalInfoEncryption.test.ts` (2 tests — the raw DB row is provably not plaintext while the API's own GET still returns the correct plaintext; an update re-encrypts). Found and fixed while running the full suite: Phase A's claim/merge content test had asserted a raw DB value that's now encrypted — fixed by decrypting before asserting (see `tasks/lessons.md`). `npm run test` (123 API + 27 shared + 5 web = 155) + `npm run typecheck` + full `apps/api` build clean.
- [x] **Phase H** — GDPR retention ✅. Confirmed export (`GET /auth/export`) and delete (`DELETE /auth/me`) already existed (direct read) — no code needed there. Real gap found while scoping this: Phase 10's soft-delete (`Child.deletedAt`, 30-day restore) had no follow-through — a soft-deleted child just stayed soft-deleted forever. New `apps/api/src/lib/childPurge.ts`'s `purgeExpiredDeletedChildren()` hard-deletes anything past `RESTORE_WINDOW_DAYS` (now exported from `deletion.ts` so both places share one constant, not two copies of "30"), content cascading via the same `onDelete: Cascade` relations every other hard-delete already relies on. New `purge-deleted-children` worker job, daily at 04:00, same idempotent-registration pattern as the other jobs. Written retention policy at `docs/data_retention_policy.md` covering every data category (account, child, medical, billing, analytics, auth tokens) and by what mechanism each is bounded. Proof: `lib/childPurge.test.ts` (3 tests — hard-deletes past the window, leaves a fresh soft-delete untouched, never touches a never-deleted child). `npm run test` (126 API + 27 shared + 5 web = 158) + `npm run typecheck` + full `apps/api` build clean.
- [x] **Phase I** — Privacy-notice copy draft ✅ (spec 9.20). `docs/privacy_notice_analytics_section.md` — the copy the user asked to draft themselves and publish to `splitkid.com/privacy` (not an in-app page, per their explicit choice). Covers exactly what's logged (relationship, inviter's relationship, time-to-accept), what's deliberately never logged (no childId/userId/email — a schema-level guarantee, not a query-layer promise), the no-gender-derivation rule, and the 10-record minimum-cohort aggregation rule — cross-referenced against the actual `AccessGrantEvent` model and its existing test coverage so the copy doesn't drift from what the code actually does.
- [x] **Phase J** — Media ✅. Gallery view confirmed already existing (`MediaGalleryTab`) — this was a fix/validate pass, not new UI. **Android deselect bug**: root cause was `GalleryThumb`'s `pointerdown` handler never calling `preventDefault()` — Android Chrome's native long-press-on-image handling (save/open/copy menu) can fire concurrently with the component's own JS long-press timer even with `pointer-events-none`/`touch-action: manipulation`/`-webkit-touch-callout: none` already in place (none of those suppress that specific native gesture), firing a `pointercancel` that clears the timer without ever toggling selection. Fixed with one `e.preventDefault()` call. **Gzip compression — investigated, deliberately NOT implemented**: traced every `mediaStorage.pathFor()`/`.readStream()` call site before building it and found two real problems, not just the already-known "barely shrinks JPEG/WebP/MP4" caveat — `worker.ts` hands sharp/ffmpeg the original's raw filesystem path directly (bypassing the storage interface entirely; gzipping at `save()` time would break every image/video processing job outright), and `readStream()` is the one method serving *both* originals and derivatives, so unconditional gunzip would corrupt every derivative response. Documented in `tasks/lessons.md` — this tipped from "low-value" to "not worth building" once the actual risk was traced, not silently dropped. **Original-media retention for future purchase use (photo books, calendars)**: confirmed already true today (`MediaAsset.originalPath` always kept, lossless, distinct from `derivedPath`) — no code needed. Proof: `apps/web/src/routes/MediaGalleryPage.test.tsx` (3 tests — `preventDefault` is called on pointerdown, plain tap still opens when nothing's selected, plain tap toggles selection once something is). `npm run test` (126 API + 27 shared + 8 web = 161) + `npm run typecheck` + `npm run build:web` clean. Needs live Android verification once shipped — flagged, this session has no Android device to confirm against.
- [x] **Phase K** — Data-quality validation ✅. **DK holidays**: cross-checked the full list against Wikipedia's "Public holidays in Denmark" — all 10 confirmed correct and current; Store Bededag's 2024 abolition confirmed (Danish Parliament vote, 28 Feb 2023, 95-68) and correctly absent from the list already; also confirmed Christmas Eve/New Year's Eve are correctly excluded (not official public holidays despite the retail-closure law covering them). No code change needed — comment updated to record the verification. **DK medical schedule**: the seed data's own comment already claimed real sourcing from an official government xlsx export (superseding an earlier first-pass approximation) — cross-checked the vaccination ages specifically against SSI's (Statens Serum Institut) current live schedule and they match exactly (3/5/12mo, 15mo, 4yr, 5yr, 12yr). GP checkup ages weren't independently re-confirmed against a second source (sst.dk consistently rate-limited automated fetches) — flagged plainly rather than claimed as verified. **WHO growth percentiles**: found already fully implemented (`apps/web/src/lib/whoGrowthStandards.ts`) — the old backlog note calling this "deferred" was stale. Spot-checked against WHO's own published methodology; the well-known reference figures (boys height/weight-for-age at birth: 49.9cm/3.3kg) check out. New test coverage added since none existed: `whoGrowthStandards.test.ts` (7 tests — checkpoint lookup, gender-curve distinction, interpolation, out-of-range null handling, gender-OTHER null handling, percentile bucketing, the weight→BMI 10-year cutover). `npm run test` (126 API + 27 shared + 15 web = 168) + `npm run typecheck` + `npm run build:web` clean.

**Deliberately not touched, per explicit instruction:** D8 + support-email confirmation (until production promoted); real SMS/email provider (ignored); Google/Outlook calendar sync (kept open, no action).

### Backlog review — all 11 phases (A–K) shipped

- **New schema this pass**: `CalendarEventRequest`, `PasswordResetToken` (2 new
  migrations: `20260914181337_calendar_event_requests`, `20260914182804_password_reset_tokens`)
  — both additive, no data migration needed. `MedicalInfo` encryption and the
  `ChildDeletionRequest`/`Child.deletedAt` purge job needed no schema change at all.
- **New worker jobs**: `reconcile-subscriptions` (daily 03:30) and `purge-deleted-children`
  (daily 04:00), both following the exact idempotent-registration pattern the
  existing `renew-subscriptions`/`remind-appointments` jobs already used.
- **Real bugs found and fixed that weren't on the original list**: a latent
  foreign-key-constraint bug in claim/merge (`MediaAsset.avatarForChildId` had no
  `onDelete` clause — Phase A), the Android long-press race in the media gallery
  (Phase J).
- **A plan item correctly reversed after investigation**: gzip-compressing stored
  media originals (Phase J) — traced the actual call sites, found it would either
  break image/video processing outright or require unsafe blanket gunzip-on-read;
  documented and dropped rather than built anyway.
- **Two backlog items already done, corrected rather than left stale**: WHO growth
  percentiles (Phase K) and GDPR export/delete (Phase H) were both marked "deferred"
  in earlier tracking but were already real, working implementations by the time this
  pass checked — confirmed and cited rather than rebuilt.
- **Final count**: `npm run test` = **126 API + 27 shared + 15 web = 168 tests**,
  `npm run typecheck` and `npm run build:web` clean from repo root. Two deliverables
  handed directly to the user rather than shipped as code: the privacy-notice copy
  (`docs/privacy_notice_analytics_section.md`) and the retention policy
  (`docs/data_retention_policy.md`).
- **Still open, by explicit instruction, not oversight**: D8 (`BILLING_TEST_MODE`
  banner) and the `support@kidcom.app` inbox confirmation, until production is
  promoted; a real SMS/email provider; Google/Outlook calendar sync.
- **Needs the user's own verification this session can't do**: the Android
  long-press fix (Phase J) needs confirming on a real Android device — jsdom can't
  reproduce the native browser gesture the bug came from, only the app-level logic
  around it.

### `/security-review` pass (2026-09-14)

- [x] Open redirect fixed: `?redirect=` in `LoginPage.tsx`/`LoginTwoFactorPage.tsx`
  was only checked with `startsWith("/")`, which a `//evil.com` or `/\evil.com`
  payload bypasses (backslash is browser-normalized to `//`, same bypass class as
  react-router's own advisory). New `apps/web/src/lib/safeRedirect.ts` resolves
  through the real `URL` parser and compares origins instead. 7 new tests.
- [x] `helmet` added to the API for baseline response headers (CORP relaxed to
  `cross-origin` so cross-origin media loading from `api.kidcom.org` still works).
- [x] `sharp`/`nodemailer` upgraded (high-severity CVEs, both production-reachable —
  user-uploaded image processing, real SMTP sending); `npm audit fix` for `qs`.
- [x] `react-router-dom`/`geoip-lite` upgrades deliberately skipped — no reachable
  exploit path in this codebase's actual usage (reasoning in `tasks/lessons.md`).
- [x] **Leaked secrets** — `DEPLOYMENT.md` had a real Postgres password + SMTP
  password committed in plain text (predates this session, already pushed to
  `origin/master`); `tasks/todo.md` had a real but already-abandoned VAPID keypair.
  Both redacted in the working tree. **Confirmed by the user (2026-09-14): the DB
  and SMTP credentials have been rotated** — will be updated in production after
  deployment. Git history was NOT rewritten (not requested).
- [x] **Deploy hardening, explicit user request**: `DEPLOYMENT.md`'s deploy steps
  (first deploy, the automated "every deploy after the first" script, and rollback)
  now `rm -rf tasks docs DEPLOYMENT.md README.md scripts docker-compose.yml
  .env.example` right after every `git pull`/`checkout` — none of these are read by
  the app at build or run time, so pruning them from the production checkout is a
  second, independent layer under the existing Document Root scoping (step 0.5),
  not a replacement for it. Step 4's verification extended with two more curl 404
  checks (`DEPLOYMENT.md`, `tasks/todo.md`) proving the prune actually ran, distinct
  from the existing `package.json` check which only proves Document Root is scoped.
  These files stay fully present in the git repo and local checkouts for
  development — only the production filesystem is pruned.
- Reviewed, no change needed: session cookie config (`httpOnly`/`secure`/`sameSite`/
  Redis-backed), password-reset rate limiting (already on both routes), media upload
  (random UUID keys, no path traversal; `fluent-ffmpeg` spawns, no shell string
  concatenation), raw SQL (`$executeRawUnsafe` only in test-only `resetDb()`, not
  user-input-driven), no `dangerouslySetInnerHTML` anywhere in `apps/web`.
- `npm run test` (126 API + 22 web, 7 new) + `npm run typecheck` clean from repo
  root. Committed as `2acf200` (security fixes), `7946402` (deploy hardening) — both
  pushed to `origin/master` (2026-09-14), along with `7939f77` (Phases A-K).

### First production deploy (2026-09-14)

- [x] **Canonical domain found to be `www.kidcom.org`, not bare `kidcom.org`** —
  discovered live during the actual deploy: Plesk's own preferred-domain setting was
  301-redirecting bare `kidcom.org` → `www.kidcom.org` (confirmed via `curl -sI`
  showing `location: https://www.kidcom.org/`), unrelated to the Document
  Root/prune work above. User chose `www.kidcom.org` as canonical (Websites &
  Domains → Hosting Settings → preferred-domain redirect). `DEPLOYMENT.md` updated
  throughout to match: step 0.6 documents the setting explicitly, SSL (step 0.2)
  now issues for all three of `kidcom.org`/`www.kidcom.org`/`api.kidcom.org`,
  `CORS_ORIGIN=https://www.kidcom.org` (this one value also builds every emailed
  link — invite accept, billing checkout redirect — via `config.webBaseUrl`, so
  getting it wrong breaks more than just CORS), and every verification `curl`
  command retargeted at `www.kidcom.org` (bare `kidcom.org` correctly 301s and
  `curl -sI ... | head -1` doesn't follow redirects, so the old checks would've
  silently "passed" against the redirect response, not the real page).
  `COOKIE_DOMAIN=.kidcom.org` needed no change — the leading dot already covers
  both. **Still to do on the server**: update the live `apps/api/.env`'s
  `CORS_ORIGIN` to `https://www.kidcom.org` and `pm2 restart kidcom-api` (the file
  was created before this was discovered, per step 2, using the old value).

---

## v2.0 — Per-user theming + mandatory RLS tenant isolation (2026-09-17)

Source: `claude/theme_and_tenant_isolation_plan.md` (Appendix A of the branch's
implementation brief — review-finalized, not draft) + the brief itself. Branch:
`v2.0`, cut from `master` at `1d98478`. **The app is live in production
(`www.kidcom.org`)** — this branch's migrations and RLS rollout touch real user
data eventually; every schema/RLS change needs the same care as any other
production migration (see `DEPLOYMENT.md`'s migrate step), not just local-dev
correctness.

Non-negotiable invariants for every phase below (brief §1 — not up for
renegotiation mid-build): every auth check server-side, never client-side; RLS
is mandatory and additive under the existing `requireChildAccess`/entitlement
middleware, never a replacement for it; `SET LOCAL` inside an explicit
transaction only, never a bare `SET` (pooled single-process connection reuse
makes this the single riskiest detail in the branch); media access checked
live server-side on every fetch tied to the requester's session; themes are a
small pre-built catalogue only, no end-user authoring, no Tier 3
(`ThemedSlot`) unless a real case forces it; nothing in
`docs/roles_and_subscription_spec.md`'s model (`AccessRole`, `ChildAccess`,
entitlement/billing) gets modified by this branch.

### Phase 0 — Baseline + assessment ✅

- [x] Found `master` was not clean: uncommitted skin/nav work (second skin
  "Sky", `--nav-*` token extraction in `BottomNav.tsx`) sitting in the working
  tree. **Charlie's call**: commit it to `master` first, then branch — done as
  `1d98478` ("Add second skin 'Sky' and tokenize BottomNav shape/color").
  `v2.0` branched from `1d98478`.
- [x] **Roles & subscription spec assessment**: `docs/roles_and_subscription_spec.md`
  v1.3's Phases 0–10 are **fully implemented and merged** (commit `855954e`),
  plus a post-launch hardening pass, Phases A–K (commit `7939f77`), plus a
  security review (`2acf200`) — all already on `master`/production. This is
  **not** in-flight work to coordinate around; it's a settled foundation this
  branch's RLS policies read against. Current shape confirmed directly from
  `packages/db/prisma/schema.prisma`: `AccessRole` enum = `PARENT | GUARDIAN |
  FAMILY`; `ChildAccess` = `{id, childId, userId, role, relationship,
  medicalInfoAccess, isMinorMember, createdAt}`, unique on `[childId,
  userId]`. RLS policies in Phase 4/5 are written against exactly this shape.
- [x] **Existing theme groundwork found — changes Phase 1–3's design.**
  `master` already has a working, non-shadcn "skin" system, not the greenfield
  shadcn/ui pipeline the brief assumed: `apps/web/src/lib/themes.ts`
  (`SkinId`, `SKINS`, `DEFAULT_SKIN`, `applySkin()` → sets `<html
  data-skin="...">`), CSS-variable token blocks in `index.css` (`:root` +
  `[data-skin="sky"]`), Tailwind wired to the vars via a `withOpacity()`
  helper, and a live user-facing picker at `/preferences/skin`
  (`SettingsChoicePage.tsx`, reached from `AppPreferencesPage.tsx`). It's
  **client-only** today — `localStorage["kidcom-skin"]`, no `User` column, no
  server round-trip. No shadcn/ui anywhere in the repo (`components.json`,
  `@radix-ui/*`, `apps/web/src/components/ui/` all absent).
  **Charlie's call**: extend this system rather than adopt shadcn/ui and
  rebuild the pipeline from scratch. Phases 1–3 below are rewritten around
  that decision — see the note under Phase 1.
- [x] **Media auth assumption doesn't hold — changes Phase 5's design.** The
  brief assumes a signed-URL scheme whose only check happens at signing time
  (the "gap" Phase 5's Nginx `auth_request` wiring is meant to close). This
  repo has no signed-URL mechanism at all: `GET /media/:id`
  (`apps/api/src/routes/media/index.ts`) is already a live, per-request,
  session-cookie + `ChildAccess`-checked gate, and there is no static-file
  exposure anywhere (`express.static`/`res.sendFile` greps are empty;
  production deliberately stores media outside the web docroot per
  `DEPLOYMENT.md`, specifically because "the API streams them itself with its
  own per-request access check"). **Charlie's call**: skip the Nginx
  `auth_request` + internal endpoint entirely — the invariant it's meant to
  enforce is already true. Phase 5 below covers this with RLS on
  `MediaAsset`/`JournalPost` plus a new revocation-takes-effect-immediately
  test instead.
- [x] **Test inventory** (regression baseline — `npm run test` from repo
  root): `apps/api` has 20 test files (vitest + supertest against a real
  Postgres test DB, see `apps/api/src/testUtils/`) covering auth, billing,
  entitlement, permissions, invites, medical-info encryption, safety-floor,
  fair-use caps — **no test file exists for the media route
  (`routes/media/`) today**, so Phase 5's revocation test is net-new coverage,
  not a regression check on existing tests. `apps/web` has 7 test files
  (vitest) — none touch the skin/theme system (it's never been tested).
  `packages/shared` has 2 test files (pure-function units). No RLS test
  infrastructure exists yet (grepped repo-wide for RLS/`SET LOCAL`/
  `app.current_user_id`/`pgbouncer`: zero matches) — this is genuinely new
  ground, no prior art to build on or conflict with.
- [x] Confirmed `v2.0` boots clean, zero code changes: `docker compose ps`
  showed dev Postgres/Redis already healthy; `preview_start` for `api` and
  `web` (`.claude/launch.json`); `GET http://localhost:4000/health` →
  `{"status":"ok",...}`; `http://localhost:5173` renders the Welcome screen
  with the current Greenkeeper skin. This is the regression baseline every
  later phase diffs against.

### Phase 1 — Extend the existing skin system with per-user persistence

Replaces the brief's "adopt shadcn/ui, port the current look through it"
literally — that pipeline doesn't apply here; the CSS-variable/`data-skin`
system already *is* the Tier-1 implementation, hand-rolled instead of
shadcn/ui-based. **Deviation from the brief's literal target additions,
flagged not silent**: no new `packages/theme-kit` workspace package — nothing
outside `apps/web` needs this, so it stays in `apps/web/src/lib/` next to
where it already lives, avoiding a package boundary with exactly one
consumer. No shadcn/ui adoption — `apps/web`'s hand-rolled Tailwind
components (`Card`, `Toggle`, `SegmentedControl`, etc.) already consume the
token system correctly; migrating them to shadcn/ui primitives would be a
large, separately-risky UI rewrite this branch doesn't need.

- [x] `packages/db`: additive migration, `User.skinId String?` (nullable, no
  DB-level default — mirrors the existing `avatarUrl String?` pattern at
  `schema.prisma`). Keep the existing `skinId`/`SkinId` naming rather than
  renaming to "theme" throughout — least churn, and the brief's `themeId`/
  `DEFAULT_THEME_ID` concepts map onto the existing `skinId`/`DEFAULT_SKIN`
  one-to-one already. Migration `20260917105219_add_user_skin_id`.
- [x] `apps/api`: extend `PATCH /auth/me` (`routes/auth/index.ts`) to accept
  an optional `skinId`, validated against `isSkinId()` from
  `@kidcom/shared` (promote `isSkinId`/`SkinId`/`SKINS`/`DEFAULT_SKIN` from
  `apps/web/src/lib/themes.ts` into `packages/shared` so both API validation
  and the web client import the same source of truth — the one piece of this
  system that *does* need to be shared, unlike the rest of the theme-kit).
  Match the existing conditional-spread `data: {...}` idiom and the
  "Nothing to update" 400 check already in that handler. Add `skinId` to
  `PublicUser`/`toPublicUser()` (`packages/shared`, `routes/auth/index.ts`)
  so it round-trips on `GET /auth/me` / login.
- [x] `apps/web`: `AppPreferencesPage.tsx`'s "Skin" row and
  `SettingsChoicePage.tsx`'s picker move from the pure-`localStorage`
  `getSkin()`/`setSkin()` pattern to the same optimistic-update-with-rollback
  pattern `NotificationSettingsPage.tsx` already uses for real
  server-persisted preferences (`apiPatch` + rollback on failure) — `setSkin`
  becomes: apply locally + write `localStorage` immediately (unchanged, for
  instant paint), then `apiPatch("/auth/me", { skinId })` in the background,
  rolling back the local/localStorage value on failure.
  `localStorage["kidcom-skin"]` stays as the boot-time fast-paint cache
  (brief's "client caches last-applied theme so it paints before the profile
  fetch resolves"), but the server's `skinId` becomes the source of truth
  once `GET /auth/me` resolves — reconcile in `main.tsx`/wherever the profile
  fetch lands: if server `skinId` differs from the cached one, `applySkin()`
  + update `localStorage` to match.
  `user.skinId ?? DEFAULT_SKIN` is the resolution rule (code-level default,
  no DB default — brief's `DEFAULT_THEME_ID` requirement, satisfied by the
  already-existing `DEFAULT_SKIN` constant).
- [x] Proof: a user with no `skinId` (including every existing row after the
  migration) resolves to Greenkeeper, always. Setting a skin in
  `/preferences/skin` persists across reload *and* re-login (new: login from
  a second browser/session should now show the previously-picked skin, not
  reset to Greenkeeper — this is the actual behavior change from "client-only"
  to "per-user"). Existing `PATCH /auth/me` name/email/avatar behavior
  unaffected — run `apps/api`'s existing auth tests, add one asserting
  `skinId` round-trips and an invalid value 400s. `npm run typecheck` +
  `npm run test` clean from repo root.
  **Verified**: new `apps/api/src/routes/auth/skin.test.ts` (4 tests, all
  passing); manually verified in-browser — signed up a real account, changed
  skin at `/preferences/skin`, confirmed `PATCH /auth/me` fired (200), the
  page repainted instantly (Sky's mint/teal palette + floating dark pill
  nav), and the choice survived a full page reload.

### Phase 2 — Tier-2 asset-pack loader (lightweight, no new art required)

The brief's Phase 2/3 ask for a `ThemeProvider`/`useTheme` registry and a
Tier-2 (icon/illustration) asset-pack loader. Scoped down to match what
actually needs building: `Icon.tsx` doesn't branch per skin today, and
Greenkeeper/Sky don't need different icon art to satisfy the brief's own
resolved decision that theming is colors/typography/shape, not new
illustration sets, for v1.

- [x] Add a thin `useSkin()` hook (`apps/web/src/lib/SkinContext.tsx`)
  wrapping the current skin value + `setSkin`, so components can react to
  skin changes without re-reading `document.documentElement.dataset.skin` by
  hand — this is the `ThemeProvider`/`useTheme` equivalent, sized to what
  this codebase actually needs (a React context around the existing
  imperative `applySkin`/`localStorage` functions, not a rewrite of them).
  Wired into `AppPreferencesPage.tsx` (fixed a real pre-existing staleness
  bug: the "Skin" row used to read `localStorage` once on mount and never
  update) and `SettingsChoicePage.tsx`'s skin picker.
- [x] **Scope correction, decided during implementation, not silently**:
  did *not* build a `resolveIcon(name, skinId)` lookup. `Icon.tsx` resolves
  every icon through one global Material Symbols webfont ligature — there is
  no per-skin asset to look up, and both shipped skins were always going to
  resolve identically. Building an indirection layer with a single,
  permanently-identical resolution path for every input is exactly the
  "half-finished implementation"/"design for a hypothetical future
  requirement" this repo's own conventions call out to avoid. `useSkin()` is
  the real, load-bearing piece of Phase 2 (two real consumers); flagging
  this rather than padding the checklist with dead code.
- [x] Proof: verified in-browser — `AppPreferencesPage`'s "Skin" row now
  shows the live value via `useSkin()` instead of a stale mount-time read.

### Phase 3 — n/a, folded into Phase 1/2

Sky already shipped as the second skin (tokens + nav-shape only, no asset-pack
differences — consistent with the brief's own resolved decision that the one
candidate Tier-3 case, the calendar Child view, stays structurally identical
across skins). Nothing separate to build here; the proof is covered by Phase
1/2's "every route behaves identically in both skins" check during Phase 6's
full regression pass.

### Phase 4 — RLS pilot (mandatory)

Genuinely greenfield — confirmed zero prior art anywhere in the repo. Riskiest
phase in the branch; do not rush the first subtask.

- [x] **Prototype the `SET LOCAL` pattern in isolation first.** Did **not**
  use an auto-wrapping Prisma Client Extension in the end — while
  prototyping against Prisma's own documented
  [row-level-security recipe](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security),
  found a real, documented gap
  ([prisma/prisma#17948](https://github.com/prisma/prisma/issues/17948)):
  extensions don't propagate into the `tx` an interactive
  `prisma.$transaction(async (tx) => {...})` callback receives, and this
  codebase has several existing multi-op transactions built for their own
  atomicity (auth profile update, avatar swap, invite accept) that an
  auto-wrapping extension would silently never run for. Built an explicit
  `withRls(userId, run)` helper instead (`apps/api/src/lib/rls.ts`) — every
  RLS-relevant call site visibly, deliberately routes through it; the bare
  `prisma` singleton is never exposed to RLS-protected queries. See
  `tasks/lessons.md` for the full writeup.
- [x] **Pooled-connection interleaved-request test, written before any real
  policy**: `apps/api/src/lib/rls.test.ts` — 20+ concurrent `withRls` calls
  under different fake user ids, each reading back its own
  `current_setting()` from inside its own transaction, asserting no
  cross-call bleed, plus a leak-outside-the-transaction check. All passed
  before Phase 4 touched a real table.
- [x] **Resolved table ownership vs. app role** — and found the real
  local-dev risk was worse than "is FORCE needed": the dev role (`splitkid`)
  turned out to be the Postgres cluster's *bootstrap superuser*, which
  bypasses RLS unconditionally regardless of FORCE (confirmed empirically).
  Created a real non-superuser role (`kidcom_appuser`), transferred table
  ownership to it, and repointed local `.env`'s `DATABASE_URL` at it —
  this also correctly mirrors a Plesk-provisioned production DB user (a
  normal, non-superuser role), so it's the *right* local setup, not a
  workaround. Every RLS-enabled table gets `FORCE ROW LEVEL SECURITY`.
  Full writeup in `tasks/lessons.md`.
- [x] Raw-SQL Prisma migration `20260917111049_rls_medical_info_journal_post`:
  RLS on `medical_info` (direct `childId`) and `journal_posts` (via the
  `journal_post_children` join table) — plus `journal_post_children` itself,
  added in this same migration since `journal_posts`' policy reads through
  it. Found and fixed a real bug along the way: Prisma's `.create()` always
  compiles to `INSERT ... RETURNING`, and Postgres subjects `RETURNING` to
  the `USING` policy, not just `WITH CHECK` — the original tagged-child-only
  `USING` rejected the very first insert, since no `journal_post_children`
  linkage exists yet at that exact statement. Fixed with a narrow, transient
  "author AND not-yet-linked" clause (full detail in the migration file's
  own comment and `tasks/lessons.md`). Also added a narrow `bypassRls()`
  escape hatch for `claimMerge.ts`'s duplicate-child reconciliation, which
  moves *other* members' content and doesn't map onto "the acting user's own
  ChildAccess" at all.
- [x] Proof — all satisfied: `apps/api/src/lib/rls.medicalInfoJournalPost.test.ts`
  (5 tests) — authorized reads/writes behave correctly; a user with zero
  `ChildAccess` gets empty results *and* a rejected insert, calling
  `withRls` directly with no `requireChildAccess`/HTTP layer involved at
  all; access revocation blocks the very next read; the interleaved-request
  test repeated against the real table. Every pre-existing test that touches
  these two tables (`medicalInfoEncryption.test.ts`,
  `bootstrapGuardian.test.ts`'s claim/merge test, `permissions.test.ts`)
  passes unchanged after wiring `withRls` into every real call site that
  touches `medical_info`/`journal_posts` (`medicalInfo.ts`, `journal.ts`,
  `journalComments.ts`, `journalReactions.ts`, the GDPR export route). Full
  `npm run test` clean.

### Phase 5 — RLS full rollout + media-fetch revocation test

- [x] Extended RLS (same `FORCE`/non-superuser treatment as Phase 4) to
  every other child-scoped table found in Phase 0's schema map — migration
  `20260917113553_rls_full_rollout`: `GrowthEntry`, `ChildScheduleOccurrence`,
  `EmergencyContact`, `CustodyPlan`, `CalendarEvent` (+
  `CalendarEventChecklistItem`/`CalendarEventConfirmation`, transitive via
  `calendarEventId`), `SwapRequest`, `CalendarEventRequest`, `ListItem`,
  `MediaAsset` (all four scoping paths — owner-not-yet-attached,
  journal-tagged, avatar-for-user [including the "shares a child with the
  avatar's owner" case], avatar-for-child, list-item-image — each mirroring
  the exact branch `routes/media/index.ts`'s own app-layer check already
  used for that case, not a new rule), `Comment` and `JournalReaction`
  (transitive via `journalPostId` → `JournalPostChild`). **Confirmed not
  child-scoped, correctly excluded**: `Thread`/`ThreadMember`/`Message`
  (no `Child` relation at all), `PersonalNote` (private per-user).
  `UpgradeRequest`/`ChildDeletionRequest` also left unprotected — operational
  workflow rows, not user-authored content, outside this branch's table
  list. Wired `withRls`/`bypassRls` into every real call site across
  `custodyPlan.ts`, `growthEntries.ts`, `emergencyContacts.ts`,
  `calendarEvents.ts`, `calendar.ts`, `schedule.ts`, `swapRequests.ts`,
  `calendarEventRequests.ts`, `listItems.ts`, `journalComments.ts`,
  `journalReactions.ts`, `media/index.ts`, `auth/index.ts` (avatar swap +
  GDPR export), `children/index.ts` (child avatar swap), `messages/index.ts`
  (attaching owned media to a message), `claimMerge.ts`'s caller, and
  `worker.ts`'s two background jobs (media processing, appointment
  reminders — genuinely no per-request user, given `withRlsBypass()` instead
  of `withRls`, same reasoning as `childPurge.ts`'s hard-delete job, which
  needed the same fix for the *Phase 4* tables it cascades into).
- [x] **Media-auth proof, replacing the Nginx work per Charlie's call**:
  `apps/api/src/routes/media/index.test.ts` (first test file this route has
  ever had, 3 tests) — revoking a member's `ChildAccess` blocks their very
  next `GET /media/:id`, no delay/expiry window; a user who never had access
  is denied even holding a real, valid media id; the owner of a
  freshly-uploaded not-yet-attached asset can read it back, a stranger
  cannot.
- [x] Full walkthrough (manual, in-browser on `v2.0` locally, real HTTP
  requests against the real dev DB): signed up, created a child, set up the
  calendar (holiday-seeding + custody/events combined query — exercises the
  `withRls`-wrapped multi-query read), added a calendar appointment (write),
  posted a journal entry tagged to the child (exercises the
  create-then-link RETURNING fix live, not just in tests), added a comment,
  viewed the Media Gallery tab, added a shared-list item, opened Messages
  (unaffected area, confirmed still loads). All three `AccessRole` values
  (`PARENT`/`GUARDIAN`/`FAMILY`) against every one of these same routes are
  additionally covered by `permissions.test.ts`'s full matrix (30 assertions
  across real HTTP calls, all passing) — not re-driven by hand through the
  UI for all three roles given that real, HTTP-level coverage already
  exists; the manual pass focused on what only a browser can show (live
  repaint, real click-through flow, no mocking).
- [x] Proof: `apps/api/src/lib/rls.fullRollout.test.ts` (3 tests, spot-checks
  a direct-childId table and a transitive one with the app layer bypassed
  entirely) + everything above, plus full `npm run test` (144 API + 27 web +
  27 shared, all passing) and `npm run typecheck` (clean across all three
  workspaces) from repo root.

### Phase 6 — Full regression + sign-off ✅

- [x] Full regression pass: both skins (verified in-browser), every PRD
  feature area exercised (custody calendar, journal + comments + media
  gallery, shared lists — messaging confirmed unaffected), all three access
  roles (`permissions.test.ts`'s full matrix, real HTTP calls), RLS-protected
  paths with the app-layer check both present (every route test) and
  deliberately stubbed (`rls.medicalInfoJournalPost.test.ts`,
  `rls.fullRollout.test.ts` — call `withRls` directly, no
  `requireChildAccess`/HTTP layer involved).
- [x] Review section — see below.
- [x] `tasks/lessons.md` updated — 6 new entries covering every real
  correction made mid-build (the RETURNING/USING interaction, the superuser
  RLS-bypass discovery, the Prisma-extension propagation gap, the
  claim/merge bypass need, the orphaned schema-engine lock, the
  two-Postgres-containers mixup), plus a note qualifying the pre-existing
  `migrate dev`-doesn't-work lesson (it worked fine this session).

---

## Review — v2.0 branch ready for Charlie's review (2026-09-17)

**What shipped:**
- Per-user theming, extending the existing skin system (not a shadcn/ui
  rebuild) — `User.skinId`, `PATCH /auth/me`, `useSkin()` React context,
  optimistic-update-with-rollback picker, second skin (Sky) already live.
- Mandatory PostgreSQL Row-Level Security as a second, independent
  authorization layer under every existing app-level check, across all 15
  child-scoped tables in the schema (2 pilot + 13 full-rollout), keyed by a
  `SET LOCAL`-per-transaction GUC (`withRls()`) with a narrowly-scoped
  system bypass (`withRlsBypass()`/`bypassRls()`) for the handful of
  operations that are legitimately not "the acting user's own access"
  (claim/merge, the media-processing worker, the appointment-reminder job,
  the expired-child purge job).
- Live, per-request media authorization — already true before this branch;
  now actually tested (first test coverage `routes/media/` has ever had) and
  reinforced by RLS on `media_assets` itself.

**Verified:** `npm run typecheck` clean across `apps/api`/`apps/web`/
`packages/shared`. `npm run test`: 144 API tests (26 files, 8 new — 2 skin,
1 SET LOCAL prototype, 2 RLS-proof, 1 media-auth, plus fixes to 4 existing
test files that needed to route their own fixture/verification queries
through `withRls` once RLS went live) + 27 web + 27 shared, all passing.
Manual in-browser walkthrough of the golden paths (see Phase 5/6 entries
above) with real HTTP requests against the real local dev database.

**Flagged back rather than decided unilaterally** (all resolved with
Charlie's explicit sign-off during the session, recorded here for the
record):
1. Master wasn't a clean baseline — uncommitted skin/nav work was sitting
   in the tree. Committed to `master` first (`1d98478`), then branched.
2. Theming: extend the existing skin system rather than adopt shadcn/ui.
3. Media auth: skip the Nginx `auth_request` build entirely — the invariant
   it would have enforced was already true (`GET /media/:id` was already a
   live, per-request, session+ChildAccess-checked gate, no signed-URL or
   static-file bypass ever existed to close).

**Deviations decided during implementation, flagged not silent** (each
noted in place above, repeated here for visibility):
- No `packages/theme-kit` workspace package — nothing outside `apps/web`
  needs it; kept in `apps/web/src/lib/` instead.
- No `resolveIcon()`/asset-pack lookup — `Icon.tsx` has exactly one global
  icon source (a webfont), nothing to look up between skins; building the
  indirection would have been dead code.
- Local dev database role/ownership setup (`kidcom_appuser`, non-superuser,
  now the actual table owner) — required to make RLS testable at all
  locally (the prior dev role was an accidental Postgres bootstrap
  superuser, which bypasses RLS unconditionally); this also happens to
  correctly mirror what a Plesk-provisioned production DB user looks like,
  so it's a correction, not a workaround. `.env`'s `DATABASE_URL` now points
  at this role — flagging explicitly since it changes what "the app's DB
  identity" means locally going forward.

**Explicitly out of scope, not built** (per the brief's own instruction not
to build speculatively):
- Tier 3 (`ThemedSlot` registry) — no case surfaced that needed it; the one
  candidate (calendar Child view) stays structurally identical across skins,
  confirmed during the manual walkthrough.
- `UpgradeRequest`/`ChildDeletionRequest` RLS — operational workflow rows,
  not user-authored content, not in the brief's table list; flagging in case
  Charlie wants them included in a follow-up.

**Nothing in `roles_and_subscription_spec.md`'s model** (`AccessRole`,
`ChildAccess`, entitlement, billing) **was modified.** RLS policies read
`ChildAccess`/`AccessRole` as they exist today; `claimMerge.ts`'s own
existing `CHILD_SCOPED_MODELS_TO_MIGRATE` list and access-transfer logic
were not touched, only wrapped with the new `bypassRls()` call it needed to
keep working under RLS.

**Not pushed, not merged, not force-pushed** — `v2.0` is local-only, ready
for review.

