# Deployment — Plesk Obsidian (kidcom.org)

Production server: shared Ubuntu VM, Plesk Obsidian, multiple vhosts. Node,
PM2, and PostgreSQL are already installed. Git is pulled from GitHub via
Plesk's Git integration; chrooted SSH access is used for everything Plesk's
UI doesn't cover (build steps, PM2, Nginx proxy config).

## Layout

The monorepo has three things to run, and only one of them serves the site
directly:

- `apps/web` — a static SPA build. Served straight from `kidcom.org`'s
  docroot, no Node process behind it.
- `apps/api` — the Express API. A request-driven Node process, reverse-proxied
  from a subdomain, `api.kidcom.org`.
- `apps/api`'s worker (`dist/worker.js`) — a standalone long-running process
  (BullMQ: media processing, reminders, holiday sync, push fan-out). Not
  request-driven, so it isn't behind Nginx at all — just kept alive by PM2.

Both Node processes (api + worker) run under PM2, started from a private
checkout of the repo — **not** from inside `httpdocs`, so the source, `.env`,
and `node_modules` are never web-accessible. Nginx only ever talks to the API
over localhost.

```
/var/www/vhosts/kidcom.org/
├── httpdocs/                  ← kidcom.org docroot: apps/web/dist contents only
├── kidcom-src/                ← private checkout (Plesk Git deploy path)
│   ├── apps/api/.env          ← production env vars (not in git)
│   ├── apps/api/dist/         ← built API (server.js, worker.js)
│   ├── apps/web/dist/         ← built web app (copied into httpdocs on deploy)
│   ├── packages/db/generated/ ← prisma client (generated on the server)
│   └── ecosystem.config.cjs   ← PM2 process definitions (see below)
└── kidcom-media/              ← MEDIA_STORAGE_PATH, private (never web-served
                                  directly — the API streams it with its own
                                  access checks, same as in dev)
```

`api.kidcom.org` is a subdomain of `kidcom.org` — create it in Plesk first if
it doesn't already exist (Websites & Domains → Add Subdomain). It needs no
document root content of its own; Nginx on it just proxies to the PM2 process.

## 0. One-time Plesk setup

1. **Create the subdomain**: Websites & Domains → kidcom.org → Add Subdomain
   → `api`. Accept the default docroot (it'll sit unused — Nginx will proxy
   past it, configured in step 5).
2. **SSL**: Websites & Domains → kidcom.org → SSL/TLS Certificates → Let's
   Encrypt → issue for both `kidcom.org` (+ `www.kidcom.org` if you want it)
   and `api.kidcom.org`. Both are required — service workers and Web Push
   need HTTPS, and cookies below are marked `secure`.
3. **Redis**: confirmed already installed and running (default
   `127.0.0.1:6379`) — sessions and the BullMQ worker both depend on it.
4. **Git repository**: Websites & Domains → kidcom.org → Git → Add
   Repository:
   - Remote URL: `https://github.com/wurkagency/kidcom.git`
   - Repository name / deploy path: `kidcom-src` — **not** `httpdocs`. Plesk
     will clone into `/var/www/vhosts/kidcom.org/kidcom-src`.
   - Deployment mode: start on **manual** while you do the first deploy by
     hand below; switch to **automatic** (deploy on push) once step 6's
     deploy script is in place and you've verified it end to end once.
   - Leave "Additional deploy actions" empty for now — added in step 6,
     after the first manual deploy proves the commands work.

## 1. First deploy — get a shell (chrooted SSH) and pull the code

```bash
cd /var/www/vhosts/kidcom.org/kidcom-src
git pull   # or use Plesk's "Pull Updates" button if you set up Git via the UI instead
```

If this is truly the first deploy and Plesk's Git panel hasn't cloned yet,
`git clone https://github.com/wurkagency/kidcom.git kidcom-src` instead.

## 2. Environment variables

Create `apps/api/.env` (this exact path — `config.ts`'s `dotenv/config` import
loads a `.env` relative to the process's working directory, and PM2 will run
the api/worker with `cwd: apps/api`, per the ecosystem file below). This file
is **not** in git (`.gitignore` excludes `.env`) — create it directly on the
server, once:

```bash
mkdir -p /var/www/vhosts/kidcom.org/kidcom-src/apps/api
cat > /var/www/vhosts/kidcom.org/kidcom-src/apps/api/.env <<'EOF'
NODE_ENV=production
PORT=4000

# Postgres — password percent-encoded (the raw password contains a literal
# "+", which must be %2B in a connection URI or some parsers will mangle it).
# Raw password: vhuxN-i3xKDiTb7+jDNSu8rM
DATABASE_URL=postgresql://kidcom_appuser:vhuxN-i3xKDiTb7%2BjDNSu8rM@localhost:5432/kidcom_app

REDIS_URL=redis://localhost:6379

# Generate once with: openssl rand -hex 32 — then never change it (rotating
# it invalidates every logged-in session).
SESSION_SECRET=<paste output of `openssl rand -hex 32` here>

API_BASE_URL=https://api.kidcom.org
CORS_ORIGIN=https://kidcom.org
COOKIE_DOMAIN=.kidcom.org

MEDIA_STORAGE_PATH=/var/www/vhosts/kidcom.org/kidcom-media

# Optional — leave blank until you're ready to wire up billing/push; the API
# fails clearly at request-time (not at boot) if these are used unset.
QUICKPAY_API_KEY=
QUICKPAY_PRIVATE_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:charlie@wurk.dk
EOF
chmod 600 /var/www/vhosts/kidcom.org/kidcom-src/apps/api/.env
```

Generate the session secret and paste it in before moving on:

```bash
openssl rand -hex 32
```

If/when you're ready to enable Web Push, generate a VAPID key pair once and
paste both halves in (never regenerate afterward — it invalidates every
existing push subscription):

```bash
cd /var/www/vhosts/kidcom.org/kidcom-src
npx web-push generate-vapid-keys
```

## 3. Install, build, migrate

From the repo root (workspaces mean `npm install` must run here, not inside
`apps/api` — that's also why the deploy path holds the whole monorepo, not
just the api folder):

```bash
cd /var/www/vhosts/kidcom.org/kidcom-src
npm install
npm run build        # packages/db (prisma generate) → apps/api → apps/web
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

`npm run build` runs `prisma generate` as part of building `packages/db`, so
the generated Prisma client always matches the schema in this checkout.
`prisma migrate deploy` (never `migrate dev` here) applies any migrations
that haven't run yet against `kidcom_app` — safe to re-run on every deploy,
it's a no-op when there's nothing new.

## 4. Publish the web build

The static site lives in `httpdocs`, separate from the private checkout:

```bash
rsync -a --delete /var/www/vhosts/kidcom.org/kidcom-src/apps/web/dist/ /var/www/vhosts/kidcom.org/httpdocs/
```

(`rsync --delete` so a file removed from a later build doesn't linger in
`httpdocs` forever — plain `cp -r` would leave stale files behind.)

## 5. Nginx: proxy api.kidcom.org to the PM2-managed API

Websites & Domains → `api.kidcom.org` → Apache & nginx Settings →
"Additional nginx directives", paste:

```nginx
location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Port `4000` matches `PORT` in `apps/api/.env` above — keep them in sync if
you ever change one.

## 6. Start both Node processes under PM2

Create `/var/www/vhosts/kidcom.org/kidcom-src/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    {
      name: "kidcom-api",
      cwd: "/var/www/vhosts/kidcom.org/kidcom-src/apps/api",
      script: "dist/server.js",
      env: { NODE_ENV: "production" },
    },
    {
      name: "kidcom-worker",
      cwd: "/var/www/vhosts/kidcom.org/kidcom-src/apps/api",
      script: "dist/worker.js",
      env: { NODE_ENV: "production" },
    },
  ],
};
```

Both apps share `cwd: apps/api` on purpose — that's where `.env` lives, and
both `dist/server.js` and `dist/worker.js` load it the same way.

```bash
cd /var/www/vhosts/kidcom.org/kidcom-src
pm2 start ecosystem.config.cjs
pm2 save                # persist this process list
pm2 startup             # prints a systemd command — run the one it prints,
                         # once, so PM2 (and these apps) survive a reboot
```

Verify:

```bash
pm2 status                              # both kidcom-api and kidcom-worker should show "online"
curl -s http://127.0.0.1:4000/health    # should return {"status":"ok",...}
curl -s https://api.kidcom.org/health   # same, through Nginx + SSL
```

Open `https://kidcom.org` in a browser and confirm the app loads, and that
signup/login round-trips (proves Postgres + Redis + session cookie are all
wired correctly end to end).

## 7. Every deploy after the first (automate this)

Once the manual flow above is proven, move steps 1, 3, 4, and a PM2 restart
into Plesk's Git "Additional deploy actions" so a `git push` to `main`
deploys automatically:

```bash
cd /var/www/vhosts/kidcom.org/kidcom-src \
  && npm install \
  && npm run build \
  && npx prisma migrate deploy --schema packages/db/prisma/schema.prisma \
  && rsync -a --delete apps/web/dist/ /var/www/vhosts/kidcom.org/httpdocs/ \
  && pm2 restart ecosystem.config.cjs
```

Paste that into the repository's "Additional deploy actions" field in Plesk,
then switch the repository's deployment mode from manual to automatic.
`apps/api/.env` is untouched by any of this (it's not in git, and nothing
above writes to it) — it only needs to be created once, in step 2.

## Media storage

Originals + derivatives live on local disk at `MEDIA_STORAGE_PATH`
(`/var/www/vhosts/kidcom.org/kidcom-media` — outside `httpdocs`, not directly
web-accessible). The API streams them itself with its own per-request access
check (`GET /media/:id`), the same as in local dev — there's no Nginx static
file serving to configure for this. Create the directory once, writable by
whatever user PM2 runs as:

```bash
mkdir -p /var/www/vhosts/kidcom.org/kidcom-media
```

If disk/bandwidth ever becomes a constraint, `MediaStorage` is an interface
(`apps/api/src/lib/mediaStorage.ts`) specifically so this can be swapped for
S3-compatible object storage later without touching route/worker code.

## QuickPay (when billing is turned on)

Webhook endpoint: `https://api.kidcom.org/billing/webhook`. Configure this
URL in the QuickPay merchant dashboard once `QUICKPAY_API_KEY` /
`QUICKPAY_PRIVATE_KEY` are set in `apps/api/.env` and the process has been
restarted (`pm2 restart kidcom-api`).

## Rolling back

```bash
cd /var/www/vhosts/kidcom.org/kidcom-src
git log --oneline -5                # find the commit to roll back to
git checkout <commit-sha>
npm install && npm run build
rsync -a --delete apps/web/dist/ /var/www/vhosts/kidcom.org/httpdocs/
pm2 restart ecosystem.config.cjs
```

Rolling back a migration is not automatic — `prisma migrate deploy` only
ever moves forward. If a bad migration shipped, write a new forward migration
that undoes the change rather than trying to check out old migration files
against a newer database.
