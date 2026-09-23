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
## Phase 5 — Lists + Children + Health
## Phase 6 — Messages + Notifications + Search
## Phase 7 — Profile menu areas (Family, Account & Billing, Preferences, onboarding)
## Dev database
- 2026-09-23: all test accounts wiped (4 users, 2 test-only children and their content);
  only `charlie@wurk.dk` + children August and Pige remain. Procedure:
  docs/data_retention_policy.md → "Deleting a complete family circle".

## Known defects found during the build (owner: phase noted)
- **Account deletion (`DELETE /auth/me`, GDPR erasure) fails for every user** — 12 User
  relations have no onDelete rule (Subscription, Moment, Comment, MediaAsset ×2, Message,
  Invite, SwapRequest, CalendarEventRequest, ListItem ×2, UpgradeRequest), so Postgres
  refuses the delete. Found 2026-09-23 while wiping a test user. **Decided 2026-09-23:**
  the account goes, contributions to a child's shared history stay (shown as "Former
  member") — see docs/data_retention_policy.md. → Phase 7, with tests.

## Phase 8 — Hardening, remove legacy/web-v2, full regression, push

## Credentials (in app/.env, never committed)
- Google + Microsoft OAuth (Microsoft tenant `common`: any Entra tenant + personal accounts)
- Brevo API key, SMS sender `KidCom`, SMTP relay login + key
- Still to register before launch: production OAuth callbacks on app.kidcom.org

## Needed from Charlie
- QuickPay test-card credentials (Phase 7)
