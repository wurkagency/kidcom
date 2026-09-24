# KidCom v3.0 — Deployment guide (full)

The complete reference for putting KidCom v3.0 into production on the Plesk VM:
what runs where, first-time setup, the one-time upgrade from v2, the routine for
every deploy, verification, operations and rollback.

The command-only version is [`deployment_quick.md`](deployment_quick.md). Use
it once you have done a deploy with this guide.

Throughout this guide:

| Placeholder | Meaning | Current value |
|---|---|---|
| `APP_HOST` | The app's domain. The API is served on the same domain under `/api`. | `app.kidcom.org` (planned). v2 used `www.kidcom.org`. |
| `REPO` | The git checkout on the server | `/var/www/vhosts/kidcom.org/api` |
| `SITE` | What Plesk serves and PM2 runs from | `/var/www/vhosts/kidcom.org/httpdocs` |
| `MEDIA` | Encrypted photo and video store. Never web-served and never inside `SITE`. | `/var/www/vhosts/kidcom.org/media` |

---

## 1. What runs where

```
Phone (PWA) ──HTTPS──► nginx (Plesk) on APP_HOST
                        ├── /            → SITE/apps/web/dist   (static app, service worker)
                        └── /api/…       → 127.0.0.1:4000       (PM2: kidcom-api)
                                                 │
            PM2: kidcom-worker ◄── Redis (BullMQ queues + sessions)
                 │                         │
                 └──────► PostgreSQL (row-level security) ◄──┘
                 └──────► MEDIA folder (AES-256-GCM encrypted files)
```

- **One origin.** The app and the API share `APP_HOST`, and the API lives under
  `/api`. This is required, not optional:
  - Google/Microsoft sign-in redirects back with same-origin paths.
  - Invite links and QuickPay's return URL are built from the app origin.
  - The session cookie is set for `APP_HOST`.

  The v2 split (app on `www`, API on `api.kidcom.org`) must not be used for v3.
- **kidcom-api** (`apps/api/dist/server.js`) is the HTTP API.
- **kidcom-worker** (`apps/api/dist/worker.js`) runs the background jobs:
  - media processing: thumbnails, playable video, GPS-free copies
  - push delivery
  - appointment reminders, hourly
  - subscription renewals at 03:00 and reconciliation at 03:30
  - the daily purge at 04:00: deleted children past their restore window, login
    events older than 12 months, notifications older than 90 days, stray media
    scratch files
- **External services:**
  - Brevo: SMS codes and email
  - QuickPay: payments
  - Google and Microsoft: sign-in
  - the browsers' push services: Web Push
- **Bundled:** ffmpeg and ffprobe come in through npm (`ffmpeg-static`,
  `ffprobe-static`), so there's nothing to install system-wide.

## 2. Requirements

| | Version | Notes |
|---|---|---|
| Node.js | **20 LTS** (≥ 20) | Node 24 works for the app. On Windows its test runner crashes intermittently, but that doesn't matter in production. |
| npm | 10 | comes with Node 20 |
| PostgreSQL | ≥ 14 | The app's role must **not** be superuser and must **not** have `BYPASSRLS` (see §5.4). |
| Redis | ≥ 6.2 | Holds sessions and job queues. Enable persistence (AOF or RDB) so sign-ins survive a restart. |
| PM2 | current | `npm i -g pm2` |
| Plesk + nginx | | TLS certificate for `APP_HOST` (Let's Encrypt extension) |
| Disk | | Media grows with use. Keep `MEDIA` on local disk with room to grow and back it up (§8.3). |

## 3. Secrets and keys

All configuration lives in **`SITE/apps/api/.env`**, which exists only on the
server. It is git-ignored and never copied by the deploy routine. Generate each
secret once:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # MEDICAL_INFO_ENCRYPTION_KEY
openssl rand -hex 32   # MEDIA_ENCRYPTION_KEY
npx web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

| Key | If it is lost | If it changes |
|---|---|---|
| `MEDIA_ENCRYPTION_KEY` | **Every photo and video is unrecoverable.** | Rotate only with the procedure in §8.4. |
| `MEDICAL_INFO_ENCRYPTION_KEY` | Medical info can't be read. | Rotate only with the procedure in §8.5. Replacing it directly makes existing medical info unreadable. |
| `SESSION_SECRET` | Everyone is signed out. | Everyone is signed out. |
| `VAPID_*` | Push subscriptions stop working. | Every phone must turn push on again. |

Keep the first two in the company password manager, plus a sealed offline copy,
**apart from** the database and media backups. A backup that holds both the
media and its key protects nothing.

**Production refuses to start on a weak key.** Each of these three keys must
be set, at least 32 characters, and not a placeholder (`change-me`,
`dev-only`, `<…>`) or a development default. The API stops at startup
instead of running on a value anyone can read in the source code.

### 3.1 `apps/api/.env` — production template

```dotenv
NODE_ENV=production

DATABASE_URL=postgresql://kidcom:<password>@localhost:5432/kidcom
REDIS_URL=redis://localhost:6379

PORT=4000
SESSION_SECRET=<openssl rand -hex 32>
# FIRST origin = the app itself (invite links, QuickPay return URL).
CORS_ORIGIN=https://app.kidcom.org
COOKIE_DOMAIN=app.kidcom.org
# Public API base (QuickPay sends its payment callback here).
API_BASE_URL=https://app.kidcom.org/api

MEDICAL_INFO_ENCRYPTION_KEY=<openssl rand -hex 32 — never change>
MEDIA_STORAGE_PATH=/var/www/vhosts/kidcom.org/media
MEDIA_ENCRYPTION_KEY=<openssl rand -hex 32 — back up apart from the media>
MEDIA_ENCRYPTION_KEYS_PREVIOUS=
# Only during a medical-key rotation (§8.5):
MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS=
# Plaintext scratch space while processing (local disk, not backed up):
MEDIA_TEMP_PATH=/var/www/vhosts/kidcom.org/media-tmp

# QuickPay (test keys = test payments; live keys = real money)
QUICKPAY_API_KEY=<API user key>
QUICKPAY_PRIVATE_KEY=<private key>
# true = paid plans switch on WITHOUT payment (only while testing a deployment)
BILLING_TEST_MODE=false

VAPID_PUBLIC_KEY=<from web-push>
VAPID_PRIVATE_KEY=<from web-push>
VAPID_SUBJECT=mailto:charlie@wurk.dk

# Brevo: SMS codes + email
BREVO_API_KEY=<Brevo API key>
BREVO_SMS_SENDER=KidCom
SMS_DELIVERY=brevo
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<Brevo SMTP login>
SMTP_PASS=<Brevo SMTP key>
SMTP_FROM="KidCom" <no-reply@kidcom.org>
# SMS toll-fraud guard: most texts in any 24 hours, all accounts together
SMS_DAILY_LIMIT=500

# Google / Microsoft sign-in
OAUTH_REDIRECT_BASE=https://app.kidcom.org/api
GOOGLE_CLIENT_ID=<…>
GOOGLE_CLIENT_SECRET=<…>
MICROSOFT_CLIENT_ID=<…>
MICROSOFT_CLIENT_SECRET=<…>
MICROSOFT_TENANT_ID=common
```

Lock it down: `chmod 600 SITE/apps/api/.env`.

- **Email:** production refuses to start without `SMTP_HOST`, `SMTP_USER` and
  `SMTP_PASS`. Emails carry reset links and sign-in codes, so they are never
  written to the log instead of being sent.
- **Listen address:** the API listens on `127.0.0.1` in production. `HOST`
  overrides this, but leave it unset: nginx must be the only way in.

**Do not set `VITE_API_BASE`** for production builds. The app must call `/api`
on its own origin (the default).

## 4. Provider configuration

### 4.1 Google and Microsoft sign-in
Register exactly these redirect URIs:

- Google Cloud Console → Credentials → OAuth client:
  `https://APP_HOST/api/auth/oauth/google/callback`
- Microsoft Entra → App registrations → Authentication (Web):
  `https://APP_HOST/api/auth/oauth/microsoft/callback`

In both consoles, the authorised origin or home page is `https://APP_HOST`.

### 4.2 Brevo
- SMS sender `KidCom` (alphanumeric, at most 11 characters). Check the SMS
  credit balance; sign-up can't finish without SMS.
- The `SMTP_FROM` address's domain is verified in Brevo (SPF/DKIM), otherwise
  mail lands in spam.
- **SMS pumping (toll fraud)** is when scripted sign-ups send codes to
  premium-rate numbers to earn a share of the SMS fees. The API guards against
  it:
  - It only texts the countries the app offers
    (`packages/shared/src/phone.ts`), minus the Caribbean `+1` ranges and
    premium, toll-free and UK `070` numbers.
  - It sends at most 5 texts per number per day, across all accounts.
  - It sends at most `SMS_DAILY_LIMIT` texts per 24 hours in total. At that
    limit SMS pauses and the API logs a line starting `[ALERT] SMS daily limit
    reached`.

  Keep the Brevo SMS balance modest, and don't enable unlimited automatic
  top-up. If your Brevo plan lets you restrict SMS destination countries, use
  the same list.

### 4.3 QuickPay
- The payment window, return URL and callback are set per checkout by the API
  (`API_BASE_URL/billing/webhook`, return to `https://APP_HOST/billing`), so
  there's nothing to configure in the QuickPay manager beyond the keys.
- **Test vs live** is decided by the keys: test-mode keys take the published
  test cards (https://learn.quickpay.net/tech-talk/appendixes/test/), and live
  keys take real money.
  - Check in the QuickPay manager that the account is in test mode before any
    test.
  - (2026-09-23: the configured account already holds a subscription marked
    `test_mode: false`. Confirm the keys before testing.)
- Payment status is confirmed twice, safely: once when the customer returns
  (`POST /billing/confirm`) and once by QuickPay's callback. The first period is
  charged exactly once, whichever arrives first.
- `BILLING_TEST_MODE=true` bypasses payment entirely: paid plans switch on
  without charging. Use it only while a deployment is being tested.

### 4.4 Web Push
Generate the VAPID keys once (§3). Push works in the installed PWA (home screen)
on iOS 16.4+ and in Android browsers.

## 5. First-time setup (a fresh server)

### 5.1 Database and Redis
```sql
-- as postgres superuser
CREATE ROLE kidcom LOGIN PASSWORD '<password>' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE kidcom OWNER kidcom;
```
Redis: install, enable persistence (`appendonly yes`), and bind it to localhost.

### 5.2 Code
```bash
git clone git@github.com:wurkagency/kidcom.git /var/www/vhosts/kidcom.org/api
git -C /var/www/vhosts/kidcom.org/api checkout v3.0
mkdir -p /var/www/vhosts/kidcom.org/media /var/www/vhosts/kidcom.org/media-tmp
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env*' \
  /var/www/vhosts/kidcom.org/api/ /var/www/vhosts/kidcom.org/httpdocs/
```
Create `httpdocs/apps/api/.env` from §3.1.

### 5.3 Build and migrate
```bash
cd /var/www/vhosts/kidcom.org/httpdocs
npm ci
npx dotenv -e apps/api/.env -- npm run build
npx dotenv -e apps/api/.env -- npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
npm run budget   # optional: checks the built app against the performance budget
```

### 5.4 Check row-level security
The API's safety depends on Postgres enforcing RLS for the app's role:

```bash
cat > /tmp/rls_check.sql <<'SQL'
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user;
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
 WHERE relname IN ('growth_entries','medical_info','journal_posts','media_assets');
SQL
npx dotenv -e apps/api/.env -- sh -c 'psql "$DATABASE_URL" -f /tmp/rls_check.sql'
```
Expect `rolbypassrls = f`, `rolsuper = f`, and both security columns `t` on every row.

### 5.5 Plesk: domain, TLS and nginx
1. Create or choose the domain `APP_HOST`, issue a Let's Encrypt certificate and
   turn on "Redirect from HTTP to HTTPS".
2. **Hosting settings → Document root:** `httpdocs/apps/web/dist`.
3. **Apache & nginx settings:** turn **off** "Proxy mode", so nginx serves the
   static app itself.
4. **Additional nginx directives:**

```nginx
# The API, same origin, under /api. It listens on 127.0.0.1 only (HOST
# defaults to it in production): always proxy to 127.0.0.1:4000, never
# "localhost", which can resolve to ::1.
location /api/ {
    proxy_pass http://127.0.0.1:4000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;            # streamed video and zip downloads
    proxy_request_buffering off;    # uploads
    proxy_read_timeout 300s;
    client_max_body_size 60m;       # API limit is 50 MB per file
}

# Hashed build files: cache for a year. Caching uses "expires", not
# add_header: an add_header inside a location drops every header set
# outside it.
location /assets/ {
    expires 1y;
    try_files $uri =404;
}

# The service worker must always be re-checked
location = /sw.js {
    expires -1;
    try_files $uri =404;
}

# The app's pages (every path loads index.html) with the security headers.
# Keep these identical to apps/web/security-headers.ts.
location / {
    expires -1;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(), payment=()" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    try_files $uri $uri/ /index.html;
}
```

If Plesk rejects `location /` as a duplicate (some Plesk versions add their
own), make two changes:
- Drop that block and add `error_page 404 = /index.html;` instead.
- Put its seven `add_header … always;` lines on their own at the top level,
  outside any location, so every response gets them.

Check that the headers arrive:
```bash
curl -sI https://APP_HOST/calendar | grep -iE "content-security-policy|strict-transport|x-frame-options"
```

What the headers do:
- **Content-Security-Policy:** only KidCom's own code runs on the page, with no
  outside scripts or `eval`, which contains the damage of any XSS bug.
- **`frame-ancestors 'none'` and `X-Frame-Options`:** no other site can frame
  the app to trick a parent into tapping "Delete account" or "Cancel
  subscription".
- **HSTS:** browsers always use HTTPS for the app.

Test the CSP against the production build before deploying a change that adds
a dependency or an outside resource:
```bash
npm run test:csp --workspace=apps/web
```

5. Permissions. nginx runs as its own user and must be able to read the build:
```bash
chmod o+x /var/www/vhosts/kidcom.org /var/www/vhosts/kidcom.org/httpdocs
chown -R kidcom.org:psacln /var/www/vhosts/kidcom.org/httpdocs/apps/web/dist/
chmod -R o+rX /var/www/vhosts/kidcom.org/httpdocs/apps/web/dist/
chmod 700 /var/www/vhosts/kidcom.org/media /var/www/vhosts/kidcom.org/media-tmp
```

### 5.6 Start the processes
```bash
cd /var/www/vhosts/kidcom.org/httpdocs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup      # run the command it prints, so PM2 starts on boot
```
`ecosystem.config.cjs` is in the repository. It starts `kidcom-api` and
`kidcom-worker`, both reading `apps/api/.env`.

### 5.7 Smoke test
```bash
curl -sI https://APP_HOST/ | head -1            # 200
curl -s  https://APP_HOST/api/health            # {"status":"ok",…}
curl -sI https://APP_HOST/calendar | head -1    # 200 (SPA fallback)
pm2 status                                      # both online
pm2 logs kidcom-worker --lines 20               # "… worker ready" lines, no errors
```
Then do the manual checks in §7.

## 6. Upgrading the v2 production to v3.0 (one time)

v3.0 is a new frontend on the same backend. Your data stays. Plan about 30
minutes, done out of hours.

1. **Back up first.** This is the rollback point.
   ```bash
   pg_dump -Fc "$DATABASE_URL" > /root/backup/kidcom-pre-v3-$(date +%F).dump
   tar czf /root/backup/media-pre-v3-$(date +%F).tgz -C <current MEDIA_STORAGE_PATH> .
   ```
2. **Choose the app's domain** (`APP_HOST`) and give it TLS. Set up nginx as in
   §5.5, with the document root on `apps/web/dist` and `/api` proxied.
   - Keep the old `api.kidcom.org` vhost for a while, so old links and
     installed v2 apps still reach the API. Its `proxy_pass` must point at
     `http://127.0.0.1:4000`: the API now listens on loopback only.
   - If `APP_HOST` differs from `www.kidcom.org`, turn `www.kidcom.org` into a
     301 redirect to `https://APP_HOST`.
3. **Update `apps/api/.env`** from §3.1. Settings that are new or changed:
   - `CORS_ORIGIN`: `https://APP_HOST` first
   - `COOKIE_DOMAIN`: `APP_HOST`
   - `API_BASE_URL`: `https://APP_HOST/api`
   - `OAUTH_REDIRECT_BASE`: `https://APP_HOST/api`
   - `MEDIA_ENCRYPTION_KEY`: new, and required. Back it up before the next step.
   - `MEDIA_TEMP_PATH`
   - `BILLING_TEST_MODE`
   - `SMS_DELIVERY=brevo`, `BREVO_*`, `SMS_DAILY_LIMIT`
   - `SMTP_*`: now required in production
   - `SESSION_SECRET`: if the current value is under 32 characters or a
     placeholder, generate a new one. Everyone signs in again once.
   - `MEDICAL_INFO_ENCRYPTION_KEY`: if the current value is under 32
     characters or a placeholder, **or the variable was never set**, don't just
     replace it. Follow §8.5 at step 5 below. When the variable was missing,
     v2 encrypted medical info with the built-in value
     `dev-only-medical-encryption-key-change-me`, and that is the "old key".
4. **Register the new OAuth redirect URIs** (§4.1). Keep the old ones until the
   upgrade is verified.
5. **Deploy the branch.**
   ```bash
   git -C /var/www/vhosts/kidcom.org/api fetch
   git -C /var/www/vhosts/kidcom.org/api checkout v3.0
   ```
   Then run the routine in §7.1. `migrate deploy` applies every v3 migration.
   They are additive: data is kept and tables are renamed via Prisma mappings,
   not dropped. PM2 now uses the repository's `ecosystem.config.cjs`; if an older
   one ran under different names, `pm2 delete all` first, then
   `pm2 start ecosystem.config.cjs && pm2 save`.
   If the API refuses to start with "`… must be a random secret of at least 32
   characters in production`", the error names the key. For the medical key,
   follow §8.5 (the error message spells out the same steps).
6. **Encrypt the existing media** (safe to re-run; unconverted files are still
   served until it finishes):
   ```bash
   cd /var/www/vhosts/kidcom.org/httpdocs
   npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --dry-run
   npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --reprocess
   ```
   `--reprocess` also backfills capture metadata and the location-free copies
   for older uploads.
7. **What users will notice:**
   - Accounts without a verified mobile number are asked to add one and confirm
     it by SMS at their next sign-in.
   - Everyone else carries on as before.
8. Verify with §7.2, then remove the old OAuth redirect URIs.

## 7. Every deploy

### 7.1 Routine
```bash
git -C /var/www/vhosts/kidcom.org/api pull

rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env*' \
  /var/www/vhosts/kidcom.org/api/ /var/www/vhosts/kidcom.org/httpdocs/

cd /var/www/vhosts/kidcom.org/httpdocs
rm -rf tasks docs README.md docker-compose.yml .env.example
npm ci
npx dotenv -e apps/api/.env -- npm run build
npx dotenv -e apps/api/.env -- npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

chmod o+x /var/www/vhosts/kidcom.org /var/www/vhosts/kidcom.org/httpdocs
chown -R kidcom.org:psacln apps/web/dist/
chmod -R o+rX apps/web/dist/

pm2 restart ecosystem.config.cjs
curl -sI https://APP_HOST/ | head -1 && curl -s https://APP_HOST/api/health
```

- Keep `scripts/`. The build and the `budget` check use it. (The v2 routine
  removed it.)
- Migrations always run **before** the restart. They are forward-only and made
  so the running version keeps working during the few seconds in between.
- Installed apps update themselves: the service worker picks up the new build
  on the next launch.

### 7.2 After a deploy: manual checks
1. Sign in with a password; a 6-digit code arrives by email.
2. Sign in with Google and with Microsoft; you land in the app, not on an error.
3. Sign up with a new number; the SMS code arrives.
4. Open Today, Calendar, Moments and Lists, and view a photo and a video.
5. Upload a photo; after processing, the other parent can open it.
6. Profile → Preferences → Notifications: turn on push, then send a message from
   another account; the push arrives.
7. **Checkout with a test card** (test keys only). You enter the card on
   QuickPay's page yourself. Afterwards:
   - the plan shows Active, with a renewal date
   - in the QuickPay manager, the subscription shows **one** captured payment
     of the right amount

## 8. Operations

### 8.1 Logs
```bash
pm2 logs kidcom-api --lines 100
pm2 logs kidcom-worker --lines 100
tail -f /var/www/vhosts/system/kidcom.org/logs/proxy_error_log   # nginx
```

### 8.2 Scheduled jobs (worker, Copenhagen time)
| When | Job |
|---|---|
| hourly | appointment reminders (next 24 h) |
| 03:00 | renew subscriptions due today (QuickPay recurring charge) |
| 03:30 | reconcile checkouts left pending > 24 h |
| 04:00 | purge: deleted children past the restore window, login events > 12 months, notifications and the SMS send log > 90 days, media scratch files |

**Alert:** `pm2 logs kidcom-api | grep ALERT` shows when the SMS daily limit
was reached, which is a sign of SMS pumping. Check `sms_sends` (numbers and
countries) before raising `SMS_DAILY_LIMIT`.

### 8.3 Backups
- **Database:** nightly `pg_dump -Fc`; keep 30 days; copy off the server.
- **Media:** nightly `rsync` of `MEDIA` to off-server storage. The files are
  encrypted, so the copy is safe at rest.
- **Keys:** `MEDIA_ENCRYPTION_KEY` and `MEDICAL_INFO_ENCRYPTION_KEY` in the
  password manager and offline, never beside the backups.
- **Restore test:** quarterly, restore into a scratch database and media folder,
  and open a photo.

### 8.4 Rotating the media key
1. Put the new key in `MEDIA_ENCRYPTION_KEY` and the old one in
   `MEDIA_ENCRYPTION_KEYS_PREVIOUS` (comma-separate several). Restart both
   processes.
2. Rewrap the files. This rewrites only each file's 93-byte header, so it's
   quick:
   ```bash
   npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --rewrap
   ```
3. Run it again. When it reports `0 re-wrapped`, remove the old key, restart,
   and destroy the old key's copies.

The server can decrypt media, because it makes thumbnails, playable video and
download zips. End-to-end encryption was considered and rejected
(`tasks/todo.md` → Decisions).

### 8.5 Rotating the medical-info key
Medical info is encrypted per field with `MEDICAL_INFO_ENCRYPTION_KEY`. To
move to a new key without losing anything:

1. Generate the new key: `openssl rand -hex 32`.
2. In `apps/api/.env`, set `MEDICAL_INFO_ENCRYPTION_KEY` to the new key and
   put the old value in `MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS`.
   - Comma-separate several old values.
   - If the variable was never set before, the old value is
     `dev-only-medical-encryption-key-change-me`.
3. Restart both processes:
   ```bash
   pm2 restart ecosystem.config.cjs
   ```
   Old values still read; everything new is written with the new key.
4. Re-encrypt:
   ```bash
   npx dotenv -e apps/api/.env -- npm run medical:rekey --workspace=apps/api -- --dry-run
   npx dotenv -e apps/api/.env -- npm run medical:rekey --workspace=apps/api
   ```
5. Run it again. When it reports `0 value(s) re-encrypted, 0 unreadable`,
   empty `MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS`, restart, and destroy copies of
   the old key.
   - "Unreadable" means a value's key is in neither variable: find the right
     old key before removing anything.

### 8.6 Personal data
Account deletion, retention periods and the family-circle removal procedure are
in `docs/data_retention_policy.md`. Data kept for abuse checks (IPs, capture
metadata, sign-in events) is in `docs/management_data.md`. It is never shown in
the app.

## 9. Rollback

- **Code only** (no new migrations in the release):
  ```bash
  git -C REPO checkout <previous tag or commit>
  ```
  Then run §7.1 without the migrate step, and `pm2 restart`.
- **The release included migrations:** they are forward-only. Restore the
  pre-deploy `pg_dump` (`pg_restore --clean -d "$DATABASE_URL" <dump>`), check
  out the previous code, and rebuild.
  - Media written since then keeps working: it's encrypted with the same key.
  - Media rows created after the dump are lost.

Always take the §6.1 backup before a release with migrations.

## 10. Known gotchas

- **`git pull` fails with "local changes would be overwritten"**:
  `package-lock.json` or `tsconfig.tsbuildinfo` drifted in the checkout. Run
  `git -C REPO stash`, then pull again.
- **The app returns 500 but the API is fine:** almost always permissions. The
  build runs as root, so nginx can't read `dist`. Re-run the `chmod`/`chown`
  lines.
  - `/var/www/vhosts/kidcom.org/httpdocs` can silently revert to `750`, which is
    why `chmod o+x` is part of every deploy.
  - To confirm, look for `Permission denied` in `proxy_error_log`.
- **Sign-in "works" but you land signed out:** the session cookie isn't being
  kept. Check that:
  - `COOKIE_DOMAIN` equals `APP_HOST`
  - the site is HTTPS
  - nginx sends `X-Forwarded-Proto`
- **Google or Microsoft sign-in ends on an error page:** the redirect URI isn't
  registered exactly as in §4.1, or `OAUTH_REDIRECT_BASE` is wrong.
- **Invite emails or QuickPay return to the wrong site:** the first entry of
  `CORS_ORIGIN` must be `https://APP_HOST`.
- **Photos stay "processing":** the worker isn't running, or Redis is down.
  Check `pm2 status` and `pm2 logs kidcom-worker`.
- **The API refuses to start with "Missing required environment variable":**
  the key is set in `apps/api/.env`, but the file is missing, or PM2 was
  started from the wrong folder. Always run PM2 with `SITE/ecosystem.config.cjs`.
- **"… must be a random secret of at least 32 characters in production":** a
  key is a placeholder, a development default or too short. See §3, and §8.5
  for the medical key.
- **"SMTP_HOST, SMTP_USER and SMTP_PASS are required in production":** set the
  Brevo SMTP relay (§3.1). Email is never logged instead of sent.
- **nginx returns 502 for `/api` after upgrading:** a `proxy_pass` points at
  `localhost` or a public address. The API listens on `127.0.0.1:4000` only.
- **After changing `.env`:** `pm2 restart ecosystem.config.cjs` so both
  processes reload it.
