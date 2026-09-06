# KidCom — QA + UX Review

Static code review (senior QA tester + senior UX engineer pass), 2026-09-06. No live instance was run — the Prisma client can't be generated in this sandbox (network block on `binaries.prisma.sh`), so everything below is from reading the actual route/component code and comparing against the Stitch mockups where they exist. Six areas were reviewed in parallel; findings are consolidated and re-ranked here.

**Scope note:** this is a snapshot of the code as of chunk 8 + the new Home Dashboard. It does not replace your own click-through testing — some of these (especially timing/race-condition ones) are easiest to confirm live.

---

## Fix pass — 2026-09-06

Every item below (all 5 Critical, plus every High/Medium/Low) has been fixed in code, along with two things you flagged separately: a global header (was missing everywhere) and the invite flow (was broken enough that testing shared plans with a second parent account wasn't possible). Full list of what changed and how to test it is in `tasks/todo.md`'s new "Fix pass" section — this file is left as-is below as the original findings record, not updated line by line.

Explicitly NOT fixed (infra/ops items flagged again, not silently dropped): real encryption-at-rest for `MedicalInfo` (needs a KMS decision), a real SMS provider for phone invites (phone invites were removed from the UI instead of half-built — email invites are now fully testable), a real transactional email provider (still console-logs the accept link, same as before).

Verification here was static only, same as the original review — `tsc --noEmit` clean across `packages/shared`/`apps/web` and `npm run build:web` clean; `apps/api` shows only the same pre-existing missing-`@splitkid/db`-client cascade every chunk has shown, no new error classes. **None of this has been run live** — that's the next step, on your machine.

---

## Fix first — Critical

1. **Invite-accept is an account-takeover hole.** `apps/api/src/routes/invites/index.ts:108-126` — if the invited email already belongs to an existing account, accepting the invite never checks the submitted password against that account's real `passwordHash`. It just logs the submitter in as that user. Anyone who gets hold of an invite link addressed to someone else's email (the accept URL is logged to console for phone invites, or forwarded by email) can log in as that person with any password they type. This needs a fix before any real invite goes out — the accept flow needs to require the *existing* account's real password (or a separate "log in first, then accept" path) whenever the invited email already has an account.

2. **Free Family-tier upgrade via abandoned checkout.** `apps/api/src/routes/billing/index.ts:53-88`, `apps/api/src/middleware/billing.ts:18-23`, `apps/api/src/lib/billingPricing.ts:17-19` — `/billing/subscribe` sets `tier: FAMILY` immediately (status `PENDING`, before payment), and the child-cap/access gates only look at `tier`, never `status`. Starting a Family checkout and then closing the QuickPay tab permanently grants unlimited children for free — this was flagged in chunk 7 as "no reconciliation job yet" but turns out to be more than a soft spot: it's a straightforward free-upgrade path. Fix direction: gate `childCapForTier`/`requireActiveAccess` on `status === ACTIVE` (or `TRIALING`), not just `tier`; add a job or TTL that reverts a `PENDING` subscription back down after some window.

3. **Growth entries can never be corrected or deleted.** `apps/api/src/routes/children/growthEntries.ts` only implements `GET`/`POST` — no `PATCH`/`DELETE` at any layer. A mis-typed height/weight is permanent. Compounding this: on every `POST`, the child's headline `heightCm` is unconditionally overwritten regardless of whether the new entry is actually the most recent one by date (`growthEntries.ts:59-64`) — backfilling an old measurement silently corrupts "Current Sizes."

4. **Medical info and emergency contacts are read-only in the UI.** Both `medicalInfo.ts` and `emergencyContacts.ts` have full `POST`/`PATCH`/`DELETE` on the backend, but `apps/web/src/lib/api.ts` only exports `apiGet`/`apiPost`/`apiUpload` (no `apiPatch`/`apiDelete`), and neither `ChildMedicalPage.tsx` nor `ChildContactsPage.tsx` renders any add/edit/delete form. A parent can never actually log an allergy or add a pediatrician from the app today — this is the single biggest "missing functionality" gap found.

5. **Swap requests can be sent but never approved or declined.** The backend (`swapRequests.ts`) fully supports listing and `PATCH`-ing (approve/decline) swap requests, and a push notification fires on creation — but no frontend anywhere renders the list or gives the other parent a way to respond. The feature is a dead end past "send." (`SwapRequestCard.tsx` is create-only.)

---

## By area

### Auth / Onboarding / Invite / Profile

**Functional**
- **[High]** An already-logged-in user who opens `/invite/:token` (e.g. accepting a second child's invite) is hard-redirected to `/` with no path to accept while signed in — and the accept flow always creates/logs-in as the *invited* email, not the current session, so there's no way to accept a second invite once you have an account. (`apps/web/src/App.tsx:60`)
- **[High]** Phone-number invites show "Invitation sent successfully!" but nothing is actually delivered (just `console.log`), and the accept endpoint unconditionally rejects phone-based invites with 400 anyway — the phone-invite path is fully non-functional but tells the user it worked. (`OnboardingInvitePage.tsx:42-49`, `invites/index.ts:63-69,100-104`)
- **[Medium]** No token-validity check before rendering the accept form — an expired/already-used invite is only discovered after the user fills out name + password and submits.
- **[Medium]** `getPushSubscriptionState()` on Profile has no `.catch` — if it never resolves, the notifications toggle is stuck disabled forever with no error shown. (`ProfilePage.tsx:18-20`)

**Visual/UX**
- **[Medium]** The mockup's show/hide password eye-icon toggle isn't implemented anywhere (login, signup, invite-accept) — users can't verify what they typed.
- **[Low]** Onboarding's gender field defaults to "BOY" and is required, but is labeled "Gender" while the mockup says "Gender (Optional)" — the built copy doesn't match what the field actually does.
- **[Low]** Decorative icons render as plain `<span>` text with no `aria-hidden`, so a slow/blocked font load shows literal text like "chevron_right" to everyone, including screen readers.

### Child profile / Medical / Growth / Emergency contacts

**Functional**
- **[High]** No edit affordance anywhere on `ChildProfilePage.tsx` even though `PATCH /children/:childId` exists — name, birthday, sizes are stuck at whatever onboarding set.
- **[Medium]** `GrowthPage.tsx` derives "latest height" and "latest weight" independently by reversing entries — if the newest entry only logged weight, the header can show a height from an earlier date next to a weight from a later one with no indication they're from different dates.
- **[Medium]** `MedicalInfo` is documented (in its own schema comment) as needing encryption-at-rest + export/delete gating before real users — currently plaintext, no such gating. Known gap, not a regression, but worth having on the pre-launch list.
- **[Low]** The mockup's "Milestones" section on Growth is silently missing (no comment marking it deferred, unlike the percentile-chart deferral which *is* documented).

**Visual/UX**
- **[Medium]** Single-data-point growth chart renders the same date label twice (both axis ends) and the value badge floats at a fixed position that can visually detach from the one dot. (`GrowthChart.tsx:78-83`)
- **[Medium]** No cap/de-dup on point count — a couple years of monthly logging will visually overlap circles and labels with no scroll/zoom to compensate.
- **[Low]** A long note in Recent Logs can push the row wider than intended (missing `min-w-0`/truncation).
- **[Low]** "Call 911" is hardcoded despite `countryCode` already being modeled and used elsewhere — wrong number for a non-US family. Matches the mockup as-is, so this is a product call, not an implementation slip — flagging since the data to localize it already exists.

### Home Dashboard / Calendar / Custody / Swap Requests

**Functional**
- **[Critical]** The calendar-events query (`calendar.ts:69`) uses `startsAt: { gte: start, lte: end }` where `end` is midnight UTC on the last day of the range — so almost every event *on* that last day (anything after 00:00 UTC) is silently excluded. In `CalendarPage`, the range end is always the visible week's Sunday, so a Sunday appointment can vanish from the day view entirely; the same bug truncates the Dashboard's 14-day "next appointment" lookup.
- **[High]** "Next Appointment" on the Dashboard doesn't filter out appointments already in the past today — a parent checking the dashboard at 5pm after an 8am appointment still sees that past appointment as "next."
- **[Medium]** Timezone day-boundary bug: "today" is computed from the UTC calendar date, not the viewer's local date, so a parent west of UTC in the evening (or east of UTC very early morning) can see tomorrow's custody owner mislabeled as "Today's Custody." (`HomePage.tsx:69-71`, `CalendarPage.tsx:46`)
- **[Medium]** The new Quick Actions deep-link effect in `CalendarPage.tsx` only depends on `[loading]`, not `searchParams` — a second same-route navigation that only changes the query string (e.g. tapping a Quick Action again while Calendar is already mounted) won't re-trigger the auto-open/scroll.
- **[Medium]** `fetchMediaUrl`'s cache stores the promise itself with no `.catch` anywhere it's consumed from `HomePage` — one failed fetch (network blip, 404) permanently blanks that journal thumbnail for the rest of the session.

**Visual/UX**
- **[Medium]** The Journal card's dark gradient scrim renders unconditionally, even with no image loaded yet or no journal entries — gives the peach card a muddy half-shaded look instead of the clean mockup treatment.
- **[Medium]** Calendar's week prev/next chevron buttons have no `aria-label` — screen readers get the raw icon-ligature text or nothing.
- **[Low]** Day strip is missing `snap-x`/`snap-center` from the mockup, so swiping doesn't settle cleanly on a day.
- **[Low]** Event list lost the mockup's vertical timeline line + per-category color accent — cards are plain, no at-a-glance category cue.

*(Custody-date math itself — `resolveCustodyForDate` — was checked carefully and is correct.)*

### Journal + Media pipeline

**Functional**
- **[High]** A `FAILED` media processing status renders identically to `PROCESSING` — a corrupt upload or ffmpeg error looks like it's still working, forever, with no retry option.
- **[High]** No polling/refresh anywhere in the pipeline — after uploading, a post shows "Processing…" until the user manually navigates away and back or changes the child filter.
- **[Medium]** Pagination exists on the backend (cursor + `nextCursor`) but the frontend never uses it — a child with more than 20 journal posts can never see anything older.
- **[Medium]** Reaction toggle has no error handling and no per-click disabling — a failed request fails silently, and rapid double-taps can desync the count from the server.
- **[Medium]** Delete is fully authorized correctly on the backend (author-only) but has no UI affordance at all — the mockup's kebab menu was never built, so delete is unreachable.
- **[Low]** Comments can be created and read but never edited or deleted.
- **[Low]** Video posts are visually indistinguishable from photo posts in the feed — no play icon/badge, so there's no way to know a video exists (playback itself is out of scope per the chunk 5 plan, but the lack of any visual cue is a UX gap on top of that).

**Visual/UX**
- **[Medium]** Post title has no `truncate`/`line-clamp` (the body text does) — a long title makes cards uneven.
- **[Medium]** No kebab-menu element in the card layout at all, unlike the mockup's header row.
- **[Low]** No client-side file-size check before upload — an oversized file only fails after a full upload attempt, with a generic error.
- **[Low]** Media `<img>` alt text is always empty — no description for screen readers.

### Messaging / Lists / Notes

**Functional**
- **[High]** Claim-an-item is a non-atomic check-then-write (`listItems.ts:75-96`) — two co-parents tapping "Claim" on the same item in the same window can both succeed, the second silently overwriting the first, despite the route's own comment describing intended 409 behavior.
- **[Medium]** A thread's header title is derived from whichever other-sender's message happens to load first, not real membership (no `GET /threads/:threadId` exists) — a brand-new empty thread shows generic "Conversation" instead of the contact's name, and any group thread shows one member's name instead of all.
- **[Low]** `DELETE` on a list item has no ownership/claim check — any member with access to the child can delete an item someone else already claimed. May be intentional for a fully shared list; worth confirming against the PRD.
- Polling cleanup, unread logic, notes privacy scoping, and size-field UX all checked out correctly — no issues found there.

**Visual/UX**
- No mockup exists for these screens (built from PRD text); checked for internal consistency instead — all four screens correctly reuse the app's established design tokens, truncation, and empty/loading states. Only pre-existing gap: icon-only buttons across the app (not just here) have no `aria-label`.

### Billing (QuickPay) / Push notifications

**Functional**
- Covered under Critical #2 above (free Family upgrade via abandoned checkout).
- **[High]** Once `/subscribe` optimistically sets a tier with `status: PENDING`, `BillingPage` shows that tier as "Current plan" (disabled) even if the checkout failed — there's no way to retry payment for that tier short of picking a different one.
- **[High]** There is no cancel/downgrade endpoint at all. `CANCELED` is defined in the shared types but never assigned anywhere in the backend, and the daily renewal job keeps auto-charging any `ACTIVE` subscription indefinitely — a paying user currently has no way to stop being billed through the product.
- **[Medium]** The webhook handler treats a missing `accepted` field as a failure (`PAST_DUE`) rather than an unhandled case — plausible false-negative given the payload shape is still unverified against a real QuickPay account (flagged in chunk 7 too).
- **[Medium]** `checkout=cancel` (QuickPay's own cancel redirect) is never handled — a user who backs out of checkout lands back on Billing with no explanation, subscription still stuck `PENDING`.
- **[Medium]** The "day-before" appointment reminder is a single fixed 08:00 daily scan, not a true per-event day-before offset — actual lead time varies from ~1 hour to ~24 hours depending on when the appointment was created relative to that scan.
- **[Low]** Once a trial expires, `status` never leaves `TRIALING` — Billing still displays "Trial ends <past date>" after access is already blocked server-side, reading as if the trial is still active.

**Visual/UX**
- Notifications card (three states) and Billing's card layout both correctly match the rest of the app's design tokens — no discrepancies found.
- **[Low]** Billing has no distinct empty/error illustration state, just plain text — minor, inconsistent with richer empty states elsewhere (e.g. Profile's "no child yet" card).

---

## Suggested triage order

1. Invite-accept account takeover (security — fix before any real invite goes out)
2. Abandoned-checkout free upgrade (revenue/abuse)
3. Medical info + emergency contacts read-only (core promised functionality, not just a nice-to-have)
4. Swap-request approve/decline missing UI (half-built feature, push notification already implies it works)
5. Calendar end-of-range `lte` bug (silently drops real events/appointments)
6. Growth entries no edit/delete
7. Everything else, roughly in the severity order above

Happy to start fixing any of these — say which ones (or "top 3", "everything Critical/High") and I'll turn them into a implementation plan.
