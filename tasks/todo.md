# KidCom v3.0 — build tracker

Branch: `v3.0` (from `master` @ ee2174c). Design source of truth: `docs/design/aura/`
(Stitch exports; header + dock always from `000_base_scaffold`). Full plan and decisions:
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
- Profile menu: Family, Children, Account & Billing, Preferences, Bookmarks.
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
- [ ] Baseline API suites (`npm test --workspace=apps/api`) — **blocked: no Postgres/Redis
      on this machine (Docker not installed)**
- [x] Remove placeholder route READMEs, fix stale DEPLOYMENT.md / tasks/todo.md refs
- [x] Delete `packages/db/prisma/migration_calendar_redesign.sql` (already covered by
      migration `20260908222540_calendar_event_checklist_confirmation`)
- [x] Copy Aura exports to `docs/design/aura/` (5 corrupt `screen.png` removed:
      create_moment, media_gallery, preview, reset_password, video_preview — compare
      those against a render of their `code.html`)
- [ ] Move old frontend to `apps/web-legacy` (reference only; deleted in Phase 8)

## Phase 1 — Foundations
- [ ] `packages/theme-kit` (manifest contract, ThemeProvider, registry, DEFAULT_THEME_ID)
- [ ] `packages/core` (API client, TanStack Query hooks, routing table + guards, i18n, device)
- [ ] Shared zod contracts in `packages/shared`
- [ ] `packages/themes/aura`: tokens, shadcn init + Aura variants, AppShell/StackShell/AuthShell,
      desktop gate
- [ ] API: `skinId` → `themeId`, `User.locale`, remove skin code
- [ ] API: Journal → Moments rename
- [ ] ESLint boundary rules, `i18n:check`, Playwright visual harness

## Phase 2 — Auth (OAuth, SMS OTP via Brevo)
## Phase 3 — Categories + Today + Calendar
## Phase 4 — Moments + Media + Bookmarks
## Phase 5 — Lists + Children + Health
## Phase 6 — Messages + Notifications + Search
## Phase 7 — Profile menu areas (Family, Account & Billing, Preferences, onboarding)
## Phase 8 — Hardening, remove web-legacy, full regression, push

## Needed from Charlie
- Local Postgres 16 + Redis 7 (Docker Desktop or native) to run API suites and migrations
- Google + Microsoft OAuth client IDs/redirect URIs (Phase 2)
- Brevo API key + SMS sender name (Phase 2)
- QuickPay test-card credentials (Phase 7)
