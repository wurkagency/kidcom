# Deployment — Plesk Obsidian (kidcom.org)

Production server: shared Ubuntu VM, Plesk Obsidian, multiple vhosts. Node,
PM2, and PostgreSQL are already installed. Git is pulled from GitHub via
Plesk's Git integration; chrooted SSH access is used for everything Plesk's
UI doesn't cover (build steps, PM2, Nginx proxy config).

## Layout

The monorepo has three things to run, and only one of them serves the site
directly:

- `apps/web` — a static SPA build. Served straight from `kidcom.org`'s
  document root, no Node process behind it.
- `apps/api` — the Express API. A request-driven Node process, reverse-proxied
  from a subdomain, `api.kidcom.org`.
- `apps/api`'s worker (`dist/worker.js`) — a standalone long-running process
  (BullMQ: media processing, reminders, holiday sync, push fan-out). Not
  request-driven, so it isn't behind Nginx at all — just kept alive by PM2.

Plesk's Git integration clones into `httpdocs` by default, so that's what
this guide uses — the whole monorepo (API source, `node_modules`, `.git`,
Prisma schema/migrations) ends up living under `httpdocs` on disk. That's
fine as long as the webserver's **Document Root** is pointed at just the
built web app's output folder rather than `httpdocs` itself — Plesk supports
this natively (Hosting Settings → Document Root, any subfolder), it's the
standard pattern for deploying a JS framework build via Plesk Git. Nginx then
only ever serves `apps/web/dist`; everything else sits on disk unreachable by
URL, without needing a second checkout or any deny-rule maintenance.

```
/var/www/vhosts/kidcom.org/
├── httpdocs/                       ← Plesk Git deploy path (repo root)
│   ├── apps/api/.env               ← production env vars (not in git)
│   ├── apps/api/dist/              ← built API (server.js, worker.js)
│   ├── apps/web/dist/              ← ★ Document Root points HERE, not at httpdocs/
│   ├── packages/db/generated/      ← prisma client (generated on the server)
│   └── ecosystem.config.cjs        ← PM2 process definitions (see below)
└── kidcom-media/                   ← MEDIA_STORAGE_PATH, private (never web-served
                                       directly — the API streams it with its own
                                       access checks, same as in dev)
```

`api.kidcom.org` is a subdomain of `kidcom.org` — create it in Plesk first if
it doesn't already exist (Websites & Domains → Add Subdomain). It needs no
checkout or document root content of its own; Nginx on it just proxies to the
PM2 process (step 6).

## 0. One-time Plesk setup

1. **Create the subdomain**: Websites & Domains → kidcom.org → Add Subdomain
   → `api`. Its docroot will sit unused — Nginx will proxy past it, configured
   in step 6.
2. **SSL**: Websites & Domains → kidcom.org → SSL/TLS Certificates → Let's
   Encrypt → issue for both `kidcom.org` (+ `www.kidcom.org` if you want it)
   and `api.kidcom.org`. Both are required — service workers and Web Push
   need HTTPS, and cookies below are marked `secure`.
3. **Redis**: confirmed already installed and running (default
   `127.0.0.1:6379`) — sessions and the BullMQ worker both depend on it.
4. **Git repository**: Websites & Domains → kidcom.org → Git → Add
   Repository:
   - Remote URL: `https://github.com/wurkagency/kidcom.git`
   - Repository path: leave it as Plesk's default (`httpdocs`).
   - Deployment mode: start on **manual** while you do the first deploy by
     hand below; switch to **automatic** (deploy on push) once step 8's
     deploy script is in place and you've verified it end to end once.
   - Leave "Additional deploy actions" empty for now — added in step 8,
     after the first manual deploy proves the commands work.
5. **Document Root**: Websites & Domains → kidcom.org → Hosting Settings →
   Document Root → change from `httpdocs` to `httpdocs/apps/web/dist`. This
   is the one setting that keeps the rest of the checkout (API source,
   `node_modules`, `.git`, `packages/`) out of reach of the public webserver
   even though it physically lives under `httpdocs` — do this before the
   first real deploy, or the site briefly serves the raw repo listing instead
   of the app. The folder won't exist until the first build (step 3) runs,
   which is fine — Plesk accepts the path up front.

## 1. First deploy — get a shell (chrooted SSH) and pull the code

```bash
cd /var/www/vhosts/kidcom.org/httpdocs
git pull   # or use Plesk's "Pull Updates" button if you set up Git via the UI instead
```

If this is truly the first deploy and Plesk's Git panel hasn't cloned yet,
use Plesk's "Add Repository" flow from step 0.4 instead of cloning by hand —
Plesk needs to own the clone for its Git panel (pull/webhook/deploy actions)
to work against it afterward.

## 2. Environment variables

Create `apps/api/.env` (this exact path — `config.ts`'s `dotenv/config` import
loads a `.env` relative to the process's working directory, and PM2 will run
the api/worker with `cwd: apps/api`, per the ecosystem file below). This file
is **not** in git (`.gitignore` excludes `.env`) — create it directly on the
server, once:

```bash
mkdir -p /var/www/vhosts/kidcom.org/httpdocs/apps/api
cat > /var/www/vhosts/kidcom.org/httpdocs/apps/api/.env <<'EOF'
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

# Generate once with: openssl rand -hex 32 — then never change it (rotating
# it makes every already-encrypted MedicalInfo row unreadable, not just
# logged-in sessions this time). GDPR Art. 9 special-category data about a
# minor (condition/description/emergencyNote) is encrypted at rest with
# this key — see apps/api/src/lib/medicalEncryption.ts.
MEDICAL_INFO_ENCRYPTION_KEY=<paste output of `openssl rand -hex 32` here>

API_BASE_URL=https://api.kidcom.org
CORS_ORIGIN=https://kidcom.org
COOKIE_DOMAIN=.kidcom.org

MEDIA_STORAGE_PATH=/var/www/vhosts/kidcom.org/kidcom-media

# SMTP — real transactional email (invite emails, signup verification).
# Leaving these unset falls back to console-logging the email instead of
# sending it (same code path as dev) — set all four to actually deliver mail.
SMTP_HOST=mail.kidcom.org
SMTP_PORT=587
SMTP_USER=noreply@kidcom.org
SMTP_PASS=fq1V#502aiS2w2!
SMTP_FROM="KidCom" <noreply@kidcom.org>

# Optional — leave blank until you're ready to wire up billing/push; the API
# fails clearly at request-time (not at boot) if these are used unset.
QUICKPAY_API_KEY=
QUICKPAY_PRIVATE_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:charlie@wurk.dk
EOF
chmod 600 /var/www/vhosts/kidcom.org/httpdocs/apps/api/.env
```

Generate the session secret and paste it in before moving on:

```bash
openssl rand -hex 32
```

If/when you're ready to enable Web Push, generate a VAPID key pair once and
paste both halves in (never regenerate afterward — it invalidates every
existing push subscription):

```bash
cd /var/www/vhosts/kidcom.org/httpdocs
npx web-push generate-vapid-keys
```

**Frontend build variable — easy to miss, and the app silently fails without
it.** Unlike `apps/api/.env` above, this one is read at *build* time, not at
runtime: Vite inlines `import.meta.env.VITE_API_URL` directly into the
compiled JS when `apps/web` is built, and if it's unset it falls back to
`http://localhost:4000`. That means a build done without this file produces a
bundle that *looks* fine (it deploys, the site loads) but every API call from
a real visitor's browser tries to reach `localhost:4000` on their own
machine and fails — while `curl` straight at `api.kidcom.org` still works
perfectly, since curl never goes near this file. If signup/login ever "does
nothing" or says something vague like "Something went wrong" despite the API
itself checking out fine, check this first. Create it once:

```bash
echo "VITE_API_URL=https://api.kidcom.org" > /var/www/vhosts/kidcom.org/httpdocs/apps/web/.env.production
```

(This file is also excluded from git — same reasoning as `apps/api/.env` —
so it has to be created directly on the server, and re-created if the
checkout is ever wiped and re-cloned from scratch.)

## 3. Install, build, migrate

This deploy adds two new `apps/api` dependencies (`nodemailer` for real SMTP
delivery, `express-rate-limit` for signup/login rate limiting) — nothing
extra to do for them beyond the `npm install` below, which always installs
whatever `package.json` currently lists.

From the repo root (workspaces mean `npm install` must run here, not inside
`apps/api` — that's also why the whole monorepo needs to be checked out, not
just the api folder):

```bash
cd /var/www/vhosts/kidcom.org/httpdocs
npm install
npx dotenv -e apps/api/.env -- npm run build
npx dotenv -e apps/api/.env -- npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

The `dotenv -e apps/api/.env --` prefix matters: Prisma's CLI only
auto-loads a `.env` sitting next to `schema.prisma` or in the current
directory — not `apps/api/.env`, which is where step 2 put it — so both the
`prisma generate` that `npm run build` triggers (for `packages/db`) and
`prisma migrate deploy` need `DATABASE_URL` handed to them explicitly this
way, or they fail with `Environment variable not found: DATABASE_URL`
(`dotenv-cli` is already a repo dependency — this is the same tool the local
dev scripts use for the same reason).

`npm run build` runs `prisma generate` as part of building `packages/db`, so
the generated Prisma client always matches the schema in this checkout, and
it's what produces `apps/web/dist` — the folder Document Root (step 0.5)
points at. Vite automatically picks up `apps/web/.env.production` (created
just above) while building that workspace — no extra flag needed, unlike the
`dotenv -e` dance the API/Prisma side requires. `prisma migrate deploy`
(never `migrate dev` here) applies any migrations that haven't run yet
against `kidcom_app` — safe to re-run on every deploy, it's a no-op when
there's nothing new.

**One-time backfill for this deploy — email verification.** This deploy adds
a required-by-default email verification gate: `User.emailVerifiedAt` is
`null` for every row until a user clicks the link in a verification email.
Existing accounts in production have never gone through this flow, so
without a backfill, **every already-registered user (including your own
accounts) will hit the "verify your email" blocking screen on next login.**
Run this once, right after `prisma migrate deploy` above, to grandfather in
everyone who already had a working account before this deploy:

```bash
npx dotenv -e apps/api/.env -- npx prisma db execute \
  --schema packages/db/prisma/schema.prisma \
  --stdin <<< 'UPDATE users SET "emailVerifiedAt" = now() WHERE "emailVerifiedAt" IS NULL;'
```

Anyone who signs up *after* this point goes through the real gate as
intended — this only backfills accounts that predate the feature.

Sanity-check the frontend build actually picked up the right API URL before
moving on:

```bash
grep -rl "localhost:4000" apps/web/dist/ && echo "BAD — VITE_API_URL wasn't set at build time" \
  || echo "OK — no localhost reference in the build"
```

## 4. Confirm the site serves the build, not the repo

```bash
curl -sI https://kidcom.org/ | head -1     # expect 200, and view-source should show the built <title>KidCom</title>
curl -sI https://kidcom.org/package.json   # expect 404 — proves Document Root is scoped correctly
```

If the second command returns the raw `package.json` instead of a 404, the
Document Root change from step 0.5 didn't take (or was reverted) — fix that
before going further; don't try to patch this with `.htaccess`/deny rules
instead, since a new file added later could slip past a hand-maintained rule
list in a way a scoped Document Root simply can't.

## 5. Nginx: SPA fallback for client-side routes on kidcom.org

The app uses React Router's `BrowserRouter` — real URL paths like
`/invite/<token>` or `/journal/new`, not `#/invite/<token>` — which only
exist client-side. Nginx serving `apps/web/dist` as plain static files has
no idea those routes exist: a deep link or a browser refresh on anything but
literally `/` gets Nginx's ordinary static-file 404, because there's no
`invite/<token>.html` file on disk. The fix is the standard SPA rule: serve
the real file when one exists (JS/CSS/images under `/assets/`, the manifest,
the service worker), otherwise fall back to `index.html` and let React
Router take it from there.

Websites & Domains → `kidcom.org` → Apache & nginx Settings → "Additional
nginx directives" (on the **main domain**, not the `api` subdomain from step
6 below), paste:

```nginx
location ~ ^/ {
    try_files $uri /index.html;
}
```

Same `location ~ ^/` reasoning as step 6's proxy block — Plesk auto-generates
its own `location / { ... }` for every (sub)domain, so a literal `location /`
here would collide with it ("duplicate location \"/\""); the regex form is
syntactically distinct and takes priority, so it still applies to every
request without conflicting.

Verify:

```bash
curl -sI https://kidcom.org/invite/doesnotexist | head -1   # expect 200, not 404 — served by index.html, React Router shows its own not-found state
curl -sI https://kidcom.org/assets/$(ls apps/web/dist/assets | grep '\.js$' | head -1) | head -1   # expect 200 — confirms real files still serve directly, not swallowed by the fallback
```

## 6. Nginx: proxy api.kidcom.org to the PM2-managed API

Websites & Domains → `api.kidcom.org` → Apache & nginx Settings →
"Additional nginx directives", paste:

```nginx
location ~ ^/ {
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

Note the `location ~ ^/` (a regex match) rather than a plain `location /` —
Plesk already auto-generates its own `location / { ... }` for this subdomain
(serving its otherwise-unused document root), so pasting another literal
`location /` collides with it and nginx refuses to reload the config
("duplicate location \"/\""). A regex location is syntactically distinct, so
it can't collide, and regex locations take priority over a plain prefix
match in Nginx's matching rules — so it still intercepts every request,
achieving the same effect without the conflict. After pasting, make sure
Plesk actually confirms the config applied (not just that the text saved) —
if it reports an Nginx config error, nothing has actually reloaded yet.

Port `4000` matches `PORT` in `apps/api/.env` above — keep them in sync if
you ever change one.

Because Nginx terminates TLS here and proxies to the API over plain HTTP,
Express would otherwise see every request as insecure and silently refuse to
set the session cookie (it's `secure: true` in production — see
`apps/api/src/middleware/session.ts`). `apps/api/src/server.ts` already
calls `app.set("trust proxy", 1)` in production for this reason, so Express
trusts the `X-Forwarded-Proto` header this directive sends and correctly
sees the request as secure. Nothing to configure here, just worth knowing if
signup/login ever succeeds (`201`, user created) but no `Set-Cookie` shows up
in the response — that combination means this trust-proxy setting isn't
taking effect, usually because of a stale build (`dist/server.js` doesn't
actually contain it — `grep -n "trust proxy" apps/api/dist/server.js` to
check) rather than anything in this Nginx config.

## 7. Start both Node processes under PM2

Create `/var/www/vhosts/kidcom.org/httpdocs/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    {
      name: "kidcom-api",
      cwd: "/var/www/vhosts/kidcom.org/httpdocs/apps/api",
      script: "dist/server.js",
      env: { NODE_ENV: "production" },
    },
    {
      name: "kidcom-worker",
      cwd: "/var/www/vhosts/kidcom.org/httpdocs/apps/api",
      script: "dist/worker.js",
      env: { NODE_ENV: "production" },
    },
  ],
};
```

Both apps share `cwd: apps/api` on purpose — that's where `.env` lives, and
both `dist/server.js` and `dist/worker.js` load it the same way.

```bash
cd /var/www/vhosts/kidcom.org/httpdocs
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

## 8. Every deploy after the first (automate this)

Once the manual flow above is proven, move steps 1, 3, and a PM2 restart into
Plesk's Git "Additional deploy actions" so a `git push` to `main` deploys
automatically:

```bash
cd /var/www/vhosts/kidcom.org/httpdocs \
  && npm install \
  && npx dotenv -e apps/api/.env -- npm run build \
  && npx dotenv -e apps/api/.env -- npx prisma migrate deploy --schema packages/db/prisma/schema.prisma \
  && pm2 restart ecosystem.config.cjs
```

Paste that into the repository's "Additional deploy actions" field in Plesk,
then switch the repository's deployment mode from manual to automatic. No
copy/rsync step is needed here — Document Root already points straight at
`apps/web/dist`, so a fresh build is live the moment it finishes.
`apps/api/.env` is untouched by any of this (it's not in git, and nothing
above writes to it) — it only needs to be created once, in step 2.

## Media storage

Originals + derivatives live on local disk at `MEDIA_STORAGE_PATH`
(`/var/www/vhosts/kidcom.org/kidcom-media` — outside `httpdocs` entirely, not
web-accessible even before the Document Root change). The API streams them
itself with its own per-request access check (`GET /media/:id`), the same as
in local dev — there's no Nginx static file serving to configure for this.
Create the directory once, writable by whatever user PM2 runs as:

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
cd /var/www/vhosts/kidcom.org/httpdocs
git log --oneline -5                # find the commit to roll back to
git checkout <commit-sha>
npm install && npx dotenv -e apps/api/.env -- npm run build
pm2 restart ecosystem.config.cjs
```

Rolling back a migration is not automatic — `prisma migrate deploy` only
ever moves forward. If a bad migration shipped, write a new forward migration
that undoes the change rather than trying to check out old migration files
against a newer database.
