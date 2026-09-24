# KidCom v3.0 — build tracker

Branch: `v3.0` (from `master` @ ee2174c). Design source of truth: `docs/design/aura/`
(Stitch exports; header + dock always from `000_base_scaffold`; `kidcom_messages_1` = inbox,
`kidcom_calendar_5` = thread). Full plan and decisions:
see "Decisions" below.

## Decisions (signed off by Charlie, 2026-09-23)

- Keep backend (apps/api, packages/db, packages/shared); rebuild the web app from scratch.
- Full theme isolation: a theme owns tokens, icons, shells, layouts and screens; logic lives
  in a headless `packages/core`. Aura is theme #1.
- One header/dock (000_base_scaffold). Child selector: 1 → 1 avatar, 2 → 2 avatars,
  3+ → 2 avatars + "All".
- Undesigned screens: built strictly from Aura DESIGN.md tokens/primitives — no new styles.
- shadcn/ui for every element where a component exists.
- i18n: en-US now; da-DK, nb-NO, sv-SE scaffolded for machine translation.
- Mobile-only: soft gate with QR + "continue anyway".
- Auth: Google + Microsoft OAuth; mandatory SMS OTP at sign-up and on phone change;
  optional SMS in forgot-password; SMS via Brevo.
- Profile menu: Family, Children, Messages, Account & Billing, Preferences, Bookmarks.
  (Messages inbox lives here for now — decided 2026-09-23; "+" sheet opens a new message.)
- Notifications: standalone page, read-only rows. Messages: inbox → thread.
- Journal → Moments everywhere (Prisma models renamed via `@@map`, tables unchanged).
- Global categories shared by Calendar/Moments/Media, user-maintained in Preferences.
- Moments: plain-text location; bookmarks (moments + media).
- Not built: @mentions, blocking, presence, calls.
- One verified mobile number = one account (confirmed 2026-09-23; enforced by a partial
  unique index — SMS password recovery identifies the account by its number).
- Existing accounts without a verified number must add + verify one at next sign-in;
  changing number always re-verifies (new number takes effect only once its SMS code is
  confirmed). Confirmed 2026-09-23. Change-number UI: Phase 7 account settings.
- **Media privacy (2026-09-26)**: all media encrypted at rest (per-file keys under
  `MEDIA_ENCRYPTION_KEY`, chunked AES-256-GCM). **End-to-end encryption considered and
  rejected**: the server could no longer make thumbnails, convert iPhone video or build
  download zips; every family would need key sharing, re-sharing on join/leave and phone-loss
  recovery; and it conflicts with the "former member" retention rule.
- GPS / capture time / device from uploads, upload IP + user agent, and sign-in events are
  stored for manage.kidcom.org's abuse and fraud checks — never shown in the app. The
  uploader keeps their original; everyone else gets it without location.

## Phase 0 — Branch, baseline, cleanup

- [x] Create `v3.0` branch in `app/`
- [x] Restore broken workspace links (`node_modules/@kidcom/*` were empty dirs, not links,
      after the repo move) via `npm install`
- [x] Baseline without DB: `npm run typecheck` 0 errors; `packages/shared` 27/27 tests;
      `apps/web` 27/27 tests (7 files)
- [x] Baseline API suites against Docker `splitkid-dev` Postgres/Redis (`splitkid_test` DB
      migrated): **25/25 files, 144/144 tests pass** (two consecutive clean runs)
  - Known env flake: Node 24 on Windows intermittently segfaults a vitest worker
    (0xC0000005, native module). Default threads pool crashes immediately → switched to
    `pool: "forks"`; still ~1 in 2 runs loses one random file ("Worker exited
    unexpectedly"). Re-run when it happens; production uses Node 20. Consider pinning
    local Node 20 (nvm-windows) to eliminate it.
- Dev DB (`splitkid`) is 2 migrations behind (`migrate_users_to_aura_skin`,
  `user_terms_accepted_at`) — applied with `migrate deploy` when dev server is first booted
- [x] Remove placeholder route READMEs, fix stale DEPLOYMENT.md / tasks/todo.md refs
- [x] Delete `packages/db/prisma/migration_calendar_redesign.sql` (already covered by
      migration `20260908222540_calendar_event_checklist_confirmation`)
- [x] Copy Aura exports to `docs/design/aura/` (5 corrupt `screen.png` removed:
      create_moment, media_gallery, preview, reset_password, video_preview — compare
      those against a render of their `code.html`)
- [x] Move old frontend to `legacy/web-v2` (outside workspaces; reference only; deleted in Phase 8)

## Phase 1 — Foundations
- [x] API: `users.skinId` → `themeId` (renamed, data kept) + `users.locale`; PATCH /auth/me
      validates both; one `toPublicUser` replaces 3 copies — `preferences.test.ts`
- [x] API: Journal → Moments (Prisma models via `@map`, `/children/:id/moments`,
      `moments:post`) — `prisma migrate diff` vs migrated test DB: **empty migration**
- [x] API suite after both: 25/25 files, 145/145 tests
- [x] `packages/theme-kit`: SCREEN_IDS (55), shells, zod-validated `defineTheme`,
      ThemeProvider (instant switch, cached id, default fallback) — 4 tests
- [x] `packages/core`: API client, TanStack Query hooks (auth, children), route table +
      guards (public/guest/authed + verified email), typed `paths`, active-children filter,
      i18n (en-US bundled, others lazy; Copenhagen-time formatters), desktop soft gate — 13 tests
- [x] `packages/themes/aura`: Stitch tokens → Tailwind v4 (scoped to `[data-theme=aura]`),
      23 shadcn components (lucide → Material Symbols), AppShell/StackShell/AuthShell/
      BlankShell, 000_base_scaffold header + dock, child selector (1/2/3+ rule), quick-action
      sheet, desktop gate (QR), not-found, error, loading
- [x] `apps/web` host: React 19 / Vite 8 / Tailwind v4 / PWA (sw ported), `/api` dev proxy
- [x] Lint guardrails (`npm run lint`): theme boundary, core never imports a theme, no JSX
      literal strings in themes — each proven to fire with probe files
- [x] i18n tooling: check / export (placeholder-protected) / import (placeholder-verified)
- [x] Visual harness (Playwright, 390px @1.5x, mocked API fixtures): header **1.79%**, dock
      **1.18%** pixel mismatch vs `000_base_scaffold` (header remainder = intentional:
      initials vs broken `img` placeholders, notification dot only when unread)
- Stack note: moved to React 19 / Tailwind v4 / shadcn v4 (the plan said React 18 /
  Tailwind 3) — current shadcn CLI targets v4, and with the legacy app set aside nothing
  pins the old versions. Deduped React at the root (a stale React 18 was hoisted for Radix).
- Carried to Phase 8: `geoip-lite` (API) depends on vulnerable `ip-address`; fix is a
  breaking major upgrade

## Phase 2 — Auth (OAuth, SMS OTP via Brevo)
- [x] API: signup = name, email, mobile (E.164), consent; password set after SMS
      (`POST /auth/password`); `passwordHash` nullable
- [x] API: SMS via Brevo (`lib/smsSender`: log in dev — set SMS_DELIVERY=brevo to send —,
      memory in tests, Brevo in prod); hashed codes, 10 min, 5 attempts, 30 s cooldown,
      WebOTP autofill line; **server-side gate**: 403 PHONE_VERIFICATION_REQUIRED on every
      non-/auth endpoint; phone change only applies once verified; a verified number is
      unique (409 + partial unique index)
- [x] API: Google/Microsoft (code + PKCE + session-bound state); consent before an account
      exists; only Google's verified email links to an existing account (Microsoft never — nOAuth)
- [x] API: password rules (8+, number/symbol, 90-day reuse) on set/change/reset; forgot by
      email link or SMS code (by verified mobile, per design); reset signs in and revokes
      other sessions by default; sessions regenerated at every sign-in + per-user index
- [x] API hardening found on the way: verify-email no longer returns the token owner's
      profile to another browser; 500s no longer echo internal error messages; machine
      `code` on auth errors (translated client-side)
- [x] Screens: login, 2FA code, sign up (+ OAuth consent continuation), verify phone,
      create password, verify email, forgot, reset — lazy-loaded
- [x] Proof: API 27/27 files, 169/169 tests (+25 for these flows); UI flow specs (stateful
      fake API): signup→phone→password→email→app, password sign-in + code → `next`, steps
      can't be skipped, provider links carry consent; design diffs: forgot 0.34%, sign up
      0.60%*, login 1.90%, reset 3.21%* (*documented shifts); real Google/Microsoft
      authorize endpoints accept our redirect URIs
- Deviations (all in code comments): sign-up subtitle "Choose your role below" dropped (no
  role picker); reset's missing confirm-password input restored; buttons stay enabled as
  designed and validate on tap; radius scale pinned to what the exports rendered
  (rounded-md 6px, "rounded-DEFAULT" = square) — reverses Phase 1's DESIGN.md sm/md
  assumption; Tailwind v3 shadow/blur semantics pinned for ported classes
- Note: flag emoji don't render on Windows desktop Chromium (shows "DK"); fine on phones
- Carried: invite-accept screen (Phase 7); production OAuth callbacks on app.kidcom.org

## Phase 3 — Categories + Today + Calendar
- [x] API: global `Category` table (system set + per-user custom; enum data migrated), tasks,
      shared notes, school timetable, handover packing, custody handover time/place, event
      address/assignee/checklist kinds, `GET /overview`; 13 new tests (API 28/28, 186/186)
- [x] Core: Copenhagen date math (`dateKey`, `monthGrid`, `copenhagenInstant` …), overview /
      category / family / notes / tasks / lessons hooks, optimistic toggles, calendar filters
- [x] Screens from exports: Today, Agenda, Week, Month — visual diffs vs
      `kidcom_today_screen_updated_note` 3.2%, `calendar_3` 2.9%, `calendar_2` 4.2%,
      `calendar_1` 4.1% (remainder: fixture copy / avatars, see notes below)
- [x] Screens built to DESIGN.md: event detail + create/edit (shadcn Calendar, Select,
      Switch), swap request, note edit, task edit, School timetable (segmented switcher +
      lesson sheet), Preferences → Categories; ConfirmDialog for deletes
- [x] Flow specs (mocked API, request bodies asserted): swap request, swap approve, new
      appointment (Copenhagen time, category, assignee, to-dos), task tick, note, category
- Notes / deviations to review:
  - Stitch inconsistencies resolved to one design: title padding `pt-7` (calendar_1) vs
    `pt-6` (2, 3) → `pt-6`; Week's `#FFF4ED` swap card vs Month's peach card → peach card;
    dropdown label "Calendar" (1, 2) → the view's name
  - "Haven Verified" → "Verified" (no Haven brand in KidCom)
  - AppShell had a duplicate `pb-28`; removed (pages were 112px too tall)
  - Tailwind v4 `divide-y` borders sit on the bottom edge (v3: top) — same total height
## Phase 4 — Moments + Media + Bookmarks
- [x] API: moment category / typed location / date / `familyVisible` (RLS: hidden moments are
      parents, guardians and the author only; comments and media follow), notify → push,
      author-only edit; cross-child `GET /moments` + `/moments/media` with child/category/type
      filters; bookmarks (private, drop out when no longer visible); media details (codec,
      duration, sizes), Range reads (iOS video seeking), `?variant=source` downloads, zip
      archive (GET/POST, streamed) and 7-day owner-only emailed link. 9 new tests (API 29/29,
      195/195, each file run on its own — the Node 24 worker crash persists in one-pass runs)
- [x] Screens from exports: feed (1.7%), post + comments (3.3%), download (10.7% — fixture
      has all six ticked, the export three), video viewer with details drawer (14.6% — the
      scaffold header is 16px taller than the export's); gallery, create moment and photo
      viewer from their code.html (no PNG), reviewed by screenshot
- [x] Built to DESIGN.md: Bookmarks (Profile menu) — segmented Moments / Photos & videos
- [x] Flow specs: create (upload, children, category, place, parents-only, notify), love,
      bookmark, comment, gallery long-press select → download to device / by email
- Notes / deviations to review:
  - View switch reads "Feed / Media" (export: "Journal / Media" — Journal became Moments)
  - "All moments are encrypted and private" → "All moments are private" (media isn't
    encrypted at rest; only medical info is)
  - Comment attachments (paperclip in the composer) and GPS coordinates on the details sheet
    left out — no backing feature (no @mentions either, as agreed)
  - The details sheet is inline under the media (as in kidcom_media_viewer_player), opened
    from ⋮ → Details or by tapping the caption
  - Gallery category badges ("Artwork") not shown on every tile — only the video duration
## Phase 5 — Lists + Children + Health
- [x] API: list `dueOn` / claim with note (`PATCH …/claim`, explicit or toggle, note-only edit,
      409 `ALREADY_CLAIMED`), cross-child `GET /lists`; child cover photo (RLS clause), child
      summary gains `myRole` / `myRelationship` / `canEdit`; family members carry
      `invitedByUserId`. WHO height-for-age L/M/S tables (0–19 y) + percentile helpers in
      shared. 5 new tests; children suites re-run green (52/52)
- [x] Screens from exports: lists (9.1% — fixture shows 3 claimed cards, export 1),
      children (7.6%), child profile (20.3% — the export's full-bleed red cover photo vs grey),
      health timeline (7.4%)
- [x] Built to DESIGN.md: list item edit, child add/edit, custody plan (presets 7/7, 2-2-3,
      5-2-2-5, 9/5, 14/2, every other weekend), growth (WHO curve, half-year axis on short
      spans), medical info, contacts, invite family — reviewed by screenshot
- [x] Child selector is now multi-select (All / any subset), shared by header and Children
- [x] Flow specs: claim, claim note, child selection, add measurement, relationship edit,
      custody 9/5 and 14/2. e2e 40/40
- [x] Country formats (Charlie, 2026-09-23: "respect country formats"): dates, times,
      numbers, percent and the first day of the week follow the user's country, separate
      from the UI language — account `User.region` (null = device), else the device's
      region, else DK. Numeric formats use the country's own conventions (26.09.2026,
      15.00, 1.234,5, 60 %); formats with words keep the UI language in the country's
      order ("26 Sept 2026"). Typed decimals accept "48,5" and "48.5". Calendar, date
      picker and month grids start on the country's first day
## Phase 6 — Messages + Notifications + Search
- [x] API: `notifications` table + `lib/notify.ts` — one call records the row (kind + params,
      translated client-side) and pushes **only when the category is on and outside quiet
      hours** (Copenhagen clock; before this, push ignored preferences entirely). All 7 push
      sites moved over; new: event created, list item claimed. GET /notifications (cursor),
      POST /notifications/read; 90-day cleanup in the daily job
- [x] API: conversations — per-thread `unreadCount`; messages page **newest first** (was the
      oldest 50, so long threads never showed recent messages); a photo sent in a
      conversation opens for its members (RLS policy + route check; before, only the sender
      could see it). Search also covers calendar events (upcoming first). 6 new tests; API 225/225
- [x] Screens from exports: inbox (4.8%), conversation (19.7% — the export's two colour photos
      vs grey, no presence line)
- [x] Built to DESIGN.md: new message (one person or a group), Notifications (inbox layout,
      read-only rows, tinted until seen, bell dot in the header), Search
- [x] Flow specs: send, photo with caption, new conversation, notifications read, search → open.
      e2e 48/48
- Not built (as agreed): blocking, presence ("Active now"), calls, thread details, the
  "Kidcom" announcements row. Push text is English until the locales are translated
## Phase 7 — Profile menu areas (Family, Account & Billing, Preferences, onboarding)
- [x] **Account deletion fixed** (was failing for every user): retain-and-anonymise tombstone
      per the 2026-09-23 decision; refused while last parent/guardian of a followed child
      (409 with the children named); a child only they followed is soft-deleted
- [x] **Billing defect fixed:** the first period was never charged — the subscription
      callback only authorised the card and the first recurring charge never ran. Now
      `activateAfterAuthorization` charges it (deterministic order_id: webhook + app
      confirm can race without double-charging) and payment callbacks are matched by
      order_id (declined → past due, accepted → recovered). `POST /billing/confirm` on
      return from QuickPay (callbacks can't reach a dev machine)
- [x] QuickPay runs whenever keys are configured (was production-only); test keys in
      `app/.env`; `BILLING_TEST_MODE=true` still bypasses payment. 14-day withdrawal consent
      required for paid plans and recorded (`subscriptions.withdrawalConsentAt`)
- [x] Screens (DESIGN.md): profile menu, account (photo, name, email, change number with SMS
      code, data export, delete), family circle, plan & billing, checkout (plans from
      `GET /billing/plans`, prices in country formats), preferences (language + **country
      formats picker**, theme, notifications incl. push opt-in and quiet hours, security:
      change password, sign out other devices), invite accept, onboarding (child → invite
      → plan; users without children are sent there)
- [x] API 238/238 (10 new: deletion, sessions, checkout), e2e 56/56 (8 new flows)
- To do by Charlie: a real QuickPay test-card payment (card entry on QuickPay's page is
  yours — I don't type card numbers); then check the callback on a public URL
- "Former member" is a fixed English string on the tombstone for now; translate centrally
  when the other locales go live
## Dev database
- 2026-09-23: all test accounts wiped (4 users, 2 test-only children and their content);
  only `charlie@wurk.dk` + children August and Pige remain. Procedure:
  docs/data_retention_policy.md → "Deleting a complete family circle".

## Known defects found during the build (owner: phase noted)
- ~~**Account deletion (`DELETE /auth/me`, GDPR erasure) fails for every user** — 12 User
  relations have no onDelete rule (Subscription, Moment, Comment, MediaAsset ×2, Message,
  Invite, SwapRequest, CalendarEventRequest, ListItem ×2, UpgradeRequest), so Postgres
  refuses the delete. Found 2026-09-23 while wiping a test user. **Decided 2026-09-23:**
  the account goes, contributions to a child's shared history stay (shown as "Former
  member") — see docs/data_retention_policy.md.~~ **Fixed in Phase 7.**

## Phase 8 — Hardening, remove legacy/web-v2, full regression, push
- [x] `legacy/web-v2` deleted; `geoip-lite` 1.x → 2.0.3 (vulnerable `ip-address` gone —
      `npm audit --omit=dev`: 0 vulnerabilities)
- [x] **Production build was broken** (dev mode hid it): `whoHeightData.ts` was saved as
      Windows-1252; converted to UTF-8, whole tree scanned — no other non-UTF-8 files
- [x] **Day boundaries were UTC, not Copenhagen** (found by the regression run just after
      midnight): anything between 00:00 and 01:00/02:00 Danish time — a 00:30 appointment, a
      note, a task ticked off — showed on the previous day. Calendar and overview now query by
      Copenhagen days (`copenhagenMidnight`, DST-safe); 3 regression tests
- [x] Accessibility: axe-core WCAG 2.1 A/AA on 21 main screens, 0 serious/critical. Fixed
      contrast: "handled by someone else" events (were 40% opacity), other-month days,
      health info icons, comment times, the week/month toggle (sage → deep green), and
      `--aura-alert` #d9383a → #cf3335 (just enough for 4.5:1 on every card tint).
      Visual diffs unchanged
- [x] PWA manifest: Aura colours, maskable icon, now with stable `id`, `scope`, `lang`
- [x] Performance budget (`npm run budget`, after build): entry JS 174/200 KB gz, all JS
      405/480, CSS 20/40, largest lazy chunk 25/60 — all pass
- [x] Full regression: API 241/241, shared 33, core 26, theme-kit 4, e2e 77/77 (visual,
      flows, a11y), typecheck, lint, i18n (788 keys)

- [x] Deployment guides: `docs/deployment_guide.md` (full) and `docs/deployment_quick.md`
      (commands only); `ecosystem.config.cjs` now in the repo; `.env.example` corrected
      (`VITE_API_BASE` — was the stale `VITE_API_URL` — plus `API_BASE_URL`,
      `BILLING_TEST_MODE`, `QUICKPAY_BASE_URL`). Production dist verified to boot and serve
      /health. **v3 must be served same-origin** (API under `https://<app host>/api`): OAuth,
      invite links and QuickPay return URLs depend on it

## Review (v3.0)
- **Scope delivered:** every screen id has a real screen — 22 from Stitch exports (visual
  diffs listed per phase), the rest built strictly from DESIGN.md tokens and shadcn parts.
  Headless core + theme isolation enforced by lint; en-US complete, da/nb/sv scaffolded.
- **Defects found and fixed on the way** (all had been live in v2): account deletion
  failing for everyone; first subscription period never charged; push ignoring
  notification preferences; message photos unreadable by recipients; long threads never
  showing recent messages; comments of hidden moments readable; UTC day boundaries;
  broken production build.
- **Known limitations / follow-ups:**
  - Material Symbols font is 3.9 MB (precached once). Subsetting broke ligatures in v2;
    revisit with a GSUB-preserving subset.
  - "Former member" and push texts are English until the other locales are translated.
  - Presence, blocking, calls, @mentions, thread details: not built (as agreed).
  - QuickPay: card-entry on the payment page needs a human test with the test cards; the
    callback URL must be public (production). The QuickPay account reported a subscription
    with `test_mode: false` — confirm the account/keys are the test ones before testing.
  - Local Node is 24 (vitest worker crash on Windows); production uses Node 20.
  - Legal: DPIA and the retention exemption for "Former member" content (see
    docs/management_data.md, docs/data_retention_policy.md) need counsel sign-off.

## Credentials (in app/.env, never committed)
- Google + Microsoft OAuth (Microsoft tenant `common`: any Entra tenant + personal accounts)
- Brevo API key, SMS sender `KidCom`, SMTP relay login + key
- Still to register before launch: production OAuth callbacks on app.kidcom.org

## Needed from Charlie
- ~~QuickPay test-card credentials~~ (received 2026-09-23; keys in app/.env)
