# KidCom

A well-being and communication app for separated parents and families,
built child-first. See `docs/stitch_splitkid/splitkid_prd.md` (kept outside
this repo, alongside it in `../Docs`) for the full product spec, and
`DEPLOYMENT.md` for how this maps onto the production Plesk VM.

## Stack

- **Web**: Vite + React + TypeScript, Tailwind (Kindred Path design tokens), PWA via `vite-plugin-pwa`
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

## Project layout

```
apps/web/      Vite + React PWA
apps/api/      Express API
packages/db/   Prisma schema + generated client
packages/shared/  Shared TS types between web and api
tasks/todo.md  Chunked build plan / progress tracker
DEPLOYMENT.md  Production (Plesk) deployment notes
```

## Build order

See `tasks/todo.md` for the full chunked plan. We're building and validating
one feature area at a time rather than everything in parallel.
