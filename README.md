# KidCom

A well-being and communication app for separated parents and families,
built child-first. Product docs live alongside this repo in `../docs`; the
Aura design exports (source of truth for the UI) are in `docs/design/aura/`,
and `docs/deployment_guide.md` describes the production Plesk VM.

## Stack

- **Web**: React 19 + Vite 8 + TypeScript PWA (`vite-plugin-pwa`); TanStack Query, React Router 7,
  i18next; themes built with Tailwind v4 + shadcn/ui (Aura is theme #1)
- **API**: Express + TypeScript
- **DB**: PostgreSQL via Prisma
- **Jobs**: BullMQ + Redis
- **Payments**: QuickPay
- **Push**: Web Push (VAPID)

## Local development

Requires Node 20+, npm, and Docker Desktop.

1. Copy the env file and fill in anything beyond the local defaults:
   ```
   cp .env.example .env
   ```
2. Start Postgres + Redis:
   ```
   docker compose up -d
   ```
3. Install dependencies (root — this installs for every workspace):
   ```
   npm install
   ```
4. Generate the Prisma client and run the initial migration:
   ```
   npm run prisma:generate
   npm run prisma:migrate
   ```
5. Run both the API and the web app:
   ```
   npm run dev
   ```
   - API: http://localhost:4000 (try http://localhost:4000/health)
   - Web: http://localhost:5173

Run them separately with `npm run dev:api` / `npm run dev:web` if you want
separate terminals/logs.

## Tests

`npm run test` (root) runs every workspace's suite (`apps/api`, `apps/web`,
`packages/shared` — all vitest). `apps/api`'s integration tests hit a real
Postgres database, never the dev one: they connect to a sibling database
named `<your DATABASE_URL's db>_test` on the same Postgres server/credentials
(derived automatically from `.env`'s `DATABASE_URL` — see
`apps/api/src/testUtils/setupEnv.ts`), and truncate it between tests. Create
and migrate that database once per machine before running `apps/api`'s tests
for the first time:
```
docker exec <your-postgres-container> createdb -U <db-user> <db-name>_test
DATABASE_URL="<your DATABASE_URL, with _test appended to the db name>" npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

## Project layout

```
apps/web/              Host app: boots @kidcom/core with the installed themes (no UI of its own)
apps/api/              Express API
packages/core/         Headless app: API client, data hooks, route table + guards, i18n
packages/core/locales/ Translation catalogues (en-US source; da-DK, nb-NO, sv-SE scaffolded)
packages/theme-kit/    Core ↔ theme contract: screen ids, shells, defineTheme, ThemeProvider
packages/themes/aura/  Aura theme: tokens, shadcn/ui components, shells, every screen
packages/db/           Prisma schema + generated client
packages/shared/       Shared TS types and rules between web and api
docs/design/aura/      Google Stitch exports — the UI source of truth
tasks/todo.md          v3.0 build plan / progress tracker
```

### Theme architecture

A theme owns every pixel: tokens, fonts, icons, the four shells (`app`, `stack`, `auth`,
`blank`) and a component for every screen id in `packages/theme-kit/src/screens.ts`
(`defineTheme` rejects a theme missing any). Routes, access rules and data live in
`@kidcom/core`; themes consume core hooks and never touch the router, fetch or i18next
directly — `npm run lint` enforces this, and forbids hard-coded UI strings in themes.

- Add shadcn components to a theme: `npm run ui:add --workspace=packages/themes/aura -- <name>`
- Translations: `npm run i18n:check`, `npm run i18n:export` (→ `i18n/export/`),
  `npm run i18n:import` (← `i18n/import/`)
- Design fidelity: `npx playwright test --project=visual` (in `apps/web`) diffs screens
  against `docs/design/aura/*/screen.png`; side-by-side diffs land in
  `apps/web/e2e/.results/design-diffs/`

## Build order

See `tasks/todo.md` for the v3.0 phase plan. We're building and validating
one feature area at a time rather than everything in parallel.
