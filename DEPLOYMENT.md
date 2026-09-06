# Deployment — Plesk Obsidian (shared Ubuntu VM)

This documents the intended production deployment. It is **not executed** as
part of Chunk 1 — build/local-preview only. Revisit and validate each step
against the actual Plesk panel before the first real deploy.

## Domains

- `kidcom.com` (or the working domain) → static site, document root = `apps/web/dist` (built via `npm run build:web`).
- `api.kidcom.com` → Plesk "Node.js" application, application root = `apps/api`, startup file `dist/server.js` (built via `npm run build:api`).
- Both subdomains share the parent domain, so session cookies can be scoped with `Domain=.kidcom.com` and sent across them — no CORS credential headaches, just an explicit `CORS_ORIGIN=https://kidcom.com` on the API.

## Database

- Use the PostgreSQL database Plesk provisions on the VM. Set `DATABASE_URL` in the API's Plesk Node.js app environment variables panel.
- Run `npx prisma migrate deploy` (via SSH, from `apps/api` or `packages/db`) as part of each deploy — never `migrate dev` in production.

## Redis + BullMQ worker

- Redis needs to be installed/running on the VM (confirmed reachable via SSH per Charlie).
- The BullMQ worker (media processing, reminders, holiday sync, push fan-out) is a **standalone long-running process**, not request-driven like Passenger apps. Set it up over SSH as a systemd service (or `pm2` if systemd access isn't available) pointing at a `worker` entrypoint in `apps/api` (added in the jobs/media chunk) — e.g.:
  ```
  # /etc/systemd/system/kidcom-worker.service (example — confirm paths/user on the actual VM)
  [Unit]
  Description=KidCom BullMQ worker
  After=network.target

  [Service]
  WorkingDirectory=/var/www/vhosts/kidcom.com/api
  ExecStart=/usr/bin/node dist/worker.js
  Restart=always
  EnvironmentFile=/var/www/vhosts/kidcom.com/api/.env

  [Install]
  WantedBy=multi-user.target
  ```

## Media storage

- Originals + derivatives live on local disk under `MEDIA_STORAGE_PATH` inside the API's application root, served via Nginx (with an auth check in front — signed/short-lived URLs, added in the media chunk).
- Written behind a storage interface in the API so this can be swapped for S3-compatible object storage later without touching calling code, if disk/bandwidth becomes a constraint.

## TLS

- Let's Encrypt via Plesk's SSL/TLS Certificates panel for both `kidcom.com` and `api.kidcom.com`. Required — service workers and Web Push both need HTTPS.

## QuickPay

- Webhook endpoint: `https://api.kidcom.com/billing/webhook` (added in the billing chunk). Configure this URL in the QuickPay merchant dashboard once that route exists.

## Environment variables (API, set in Plesk's Node.js app panel)

See `.env.example` at the repo root for the full list — at minimum in production: `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `CORS_ORIGIN`, `COOKIE_DOMAIN`, `QUICKPAY_API_KEY`, `QUICKPAY_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `MEDIA_STORAGE_PATH`.

## Deploy flow (once CI/CD is set up — not yet built)

1. Push to `main` on `https://github.com/wurkagency/kidcom.git`.
2. Pull latest on the VM (or Plesk's Git integration auto-deploys).
3. `npm install && npm run build` at the repo root.
4. `npx prisma migrate deploy`.
5. Restart the Passenger app (Plesk does this automatically on file change, or via "Restart App" in the panel) and the BullMQ worker service (`systemctl restart kidcom-worker`).
