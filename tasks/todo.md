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
## Phase 3 — Categories + Today + Calendar
## Phase 4 — Moments + Media + Bookmarks
## Phase 5 — Lists + Children + Health
## Phase 6 — Messages + Notifications + Search
## Phase 7 — Profile menu areas (Family, Account & Billing, Preferences, onboarding)
## Phase 8 — Hardening, remove legacy/web-v2, full regression, push

## Credentials (in app/.env, never committed)
- Google + Microsoft OAuth (Microsoft tenant `common`: any Entra tenant + personal accounts)
- Brevo API key, SMS sender `KidCom`, SMTP relay login + key
- Still to register before launch: production OAuth callbacks on app.kidcom.org

## Needed from Charlie
- QuickPay test-card credentials (Phase 7)
