# Kinnd v3.0 — Deployment guide (full)

The complete reference for running Kinnd v3.0 in production on **Ubuntu with
Plesk Obsidian**. It covers what runs where, first-time setup, moving the v2
data across (one time), every deploy, checks, operations and rollback.

The commands-only version is [`deployment_quick.md`](deployment_quick.md). Use
it once you have done a deploy with this guide.

| Placeholder | Meaning | Value |
|---|---|---|
| `APP_HOST` | The app's domain. The API is served on the same domain under `/api`. | `app.kinnd.eu` |
| `REPO` | The git checkout. Plesk never serves it. | `/var/www/vhosts/kinnd.eu/repo` |
| `SITE` | The subdomain's folder: what Plesk serves and PM2 runs from | `/var/www/vhosts/kinnd.eu/app` |
| `MEDIA` | Encrypted photos and videos. Never web-served and never inside `SITE`. | `/var/www/vhosts/kinnd.eu/media` |
| `PLESK_USER` | The subscription's system user, which owns `SITE` | `stat -c %U /var/www/vhosts/kinnd.eu/app` |

Domains:

| Domain | Role |
|---|---|
| `app.kinnd.eu` | **The app, plus the API under `/api`.** Subdomain of `kinnd.eu`, folder `SITE`. |
| `app.kinnd.org`, `app.kinnd.net` | Aliases with a 301 redirect to `app.kinnd.eu` |
| `kinnd.eu` (`httpdocs`) | The promotional website. Separate scope: this guide doesn't touch it. It also hosts `/privacy`, `/terms` and `/help`, which the app and its emails link to. |
| `manage.kinnd.eu` | The management portal. Separate SoW: leave it alone. |

**You don't need `api.kinnd.eu`.** The API must live on the app's own host,
`app.kinnd.eu/api`; §1 explains why.

---

## 1. What runs where

```
Phone (PWA) ──HTTPS──► nginx (Plesk) on app.kinnd.eu
                        ├── /            → SITE/apps/web/dist   (static app, service worker)
                        └── /api/…       → 127.0.0.1:4000       (PM2: kinnd-api)
                                                 │
            PM2: kinnd-worker ◄── Redis (BullMQ queues + sessions)
                 │                         │
                 └──────► PostgreSQL (row-level security) ◄──┘
                 └──────► MEDIA folder (AES-256-GCM encrypted files)
```

- **One origin.** The app and the API share `app.kinnd.eu`, and the API lives under
  `/api`. This is required, not optional:
  - Google/Microsoft sign-in redirects back to same-origin paths.
  - Invite links and QuickPay's return URL are built from the app origin.
  - The session cookie belongs to `app.kinnd.eu` only. It is never sent to
    the website on `kinnd.eu` or to `manage.kinnd.eu`.
- **kinnd-api** (`apps/api/dist/server.js`) is the HTTP API.
- **kinnd-worker** (`apps/api/dist/worker.js`) runs the background jobs:
  - media processing: thumbnails, playable video, GPS-free copies
  - push delivery
  - appointment reminders, hourly
  - billing at 03:00 and reconciliation at 03:30
  - the daily purge at 04:00
- **RabbitMQ is not used.** The job queues are BullMQ on Redis. RabbitMQ can
  stay installed for other things; Kinnd doesn't connect to it.
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
| Node.js | **20 LTS or newer** | The system Node, used by PM2. Don't turn on Plesk's *Node.js* app support for `app.kinnd.eu`: nginx serves the app and PM2 runs the API. |
| npm | 10 | comes with Node 20 |
| PostgreSQL | ≥ 14 | The app's role must **not** be superuser and must **not** have `BYPASSRLS` (§5.5). |
| Redis | ≥ 6.2 | Holds sessions and job queues. Turn on persistence (AOF or RDB) so sign-ins survive a restart. Bind it to localhost. |
| PM2 | current | `npm i -g pm2` |
| Plesk Obsidian + nginx | | Let's Encrypt extension for TLS |
| Plesk Git extension | | Pulls `https://github.com/wurkagency/kinnd.git` with its own SSH deploy key (read-only, set up in Plesk → Git) and deploys the files into `REPO`. The terminal needs no GitHub access. |
| Disk | | Media grows with use. Keep `MEDIA` on local disk with room to grow, and back it up (§8.3). |

## 3. Secrets and keys

All configuration lives in **`SITE/apps/api/.env`**, which exists only on the
server. It is git-ignored, and the deploy routine never copies or overwrites it.
Generate each secret once:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # MEDICAL_INFO_ENCRYPTION_KEY (only on a fresh install: see §6)
openssl rand -hex 32   # MEDIA_ENCRYPTION_KEY
npx web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

| Key | If it is lost | If it changes |
|---|---|---|
| `MEDIA_ENCRYPTION_KEY` | **Every photo and video is unrecoverable.** | Rotate only with the procedure in §8.4. |
| `MEDICAL_INFO_ENCRYPTION_KEY` | Medical info can't be read. | Rotate only with the procedure in §8.5. Replacing it directly makes existing medical info unreadable. |
| `SESSION_SECRET` | Everyone is signed out. | Everyone is signed out. |
| `VAPID_*` | Push subscriptions stop working. | Every phone must turn push on again. |

Keep the first two in the company password manager, plus a sealed offline
copy, **apart from** the database and media backups. A backup that holds both
the media and its key protects nothing.

**Production refuses to start on a weak key.** Each of these three keys must be
set, at least 32 characters long, and not a placeholder (`change-me`,
`dev-only`, `<…>`) or a development default. Otherwise the API stops at
startup and names the key.

### 3.1 `SITE/apps/api/.env` — production template

```dotenv
NODE_ENV=production

DATABASE_URL=postgresql://kinnd:<password>@localhost:5432/kinnd
REDIS_URL=redis://localhost:6379

PORT=4000
SESSION_SECRET=<openssl rand -hex 32>
# FIRST origin = the app itself (invite links, QuickPay return URL).
CORS_ORIGIN=https://app.kinnd.eu
# Leave COOKIE_DOMAIN unset: the session cookie then belongs to app.kinnd.eu
# only. Setting it to kinnd.eu would also send it to the website and manage.
# Public API base (QuickPay sends its payment callback here).
API_BASE_URL=https://app.kinnd.eu/api

MEDICAL_INFO_ENCRYPTION_KEY=<openssl rand -hex 32, or the v2 value (§6); never change it directly>
MEDIA_STORAGE_PATH=/var/www/vhosts/kinnd.eu/media
MEDIA_ENCRYPTION_KEY=<openssl rand -hex 32; back it up apart from the media>
MEDIA_ENCRYPTION_KEYS_PREVIOUS=
# Only during a medical-key rotation (§8.5):
MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS=
# Plaintext scratch space while processing (local disk, not backed up):
MEDIA_TEMP_PATH=/var/www/vhosts/kinnd.eu/media-tmp

# QuickPay
QUICKPAY_API_KEY=<API user key>
QUICKPAY_PRIVATE_KEY=<private key>
# Only while testing a deployment with QuickPay test cards. Leave unset in
# production: a test-card authorisation then never activates a paid plan.
# QUICKPAY_ACCEPT_TEST_CARDS=true
# true = paid plans switch on WITHOUT payment (only while testing a deployment)
BILLING_TEST_MODE=false

VAPID_PUBLIC_KEY=<from web-push>
VAPID_PRIVATE_KEY=<from web-push>
VAPID_SUBJECT=mailto:charlie@wurk.dk

# Brevo: SMS codes + email
BREVO_API_KEY=<Brevo API key>
BREVO_SMS_SENDER=Kinnd
SMS_DELIVERY=brevo
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<Brevo SMTP login>
SMTP_PASS=<Brevo SMTP key>
SMTP_FROM="Kinnd" <no-reply@kinnd.eu>
# SMS toll-fraud guard: the most texts in any 24 hours, all accounts together
SMS_DAILY_LIMIT=500

# Google / Microsoft sign-in
OAUTH_REDIRECT_BASE=https://app.kinnd.eu/api
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
- **Do not set `VITE_API_BASE`** for production builds. The app must call
  `/api` on its own origin, which is the default.

## 4. Provider configuration

### 4.1 Google and Microsoft sign-in
Register exactly these redirect URIs:

- Google Cloud Console → Credentials → OAuth client:
  `https://app.kinnd.eu/api/auth/oauth/google/callback`
- Microsoft Entra → App registrations → Authentication (Web):
  `https://app.kinnd.eu/api/auth/oauth/microsoft/callback`

In both consoles:
- The authorised origin and home page are `https://app.kinnd.eu`.
- Update the app name to Kinnd, and set the privacy and terms links to
  `https://kinnd.eu/privacy` and `https://kinnd.eu/terms`.

### 4.2 Brevo
- **Domain:** add `kinnd.eu` as a sender domain (mail comes from
  `no-reply@kinnd.eu`, not from the app subdomain) and put the SPF, DKIM and DMARC
  records Brevo shows into the Plesk DNS zone. Otherwise mail from
  `no-reply@kinnd.eu` lands in spam.
- **SMS:** the sender is `Kinnd` (alphanumeric, at most 11 characters). Check
  the SMS credit balance: sign-up can't finish without SMS.
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

  Keep the Brevo SMS balance modest and don't enable unlimited automatic
  top-up.

### 4.3 QuickPay
- The API sets the payment window, return URL and callback for each checkout
  (`https://app.kinnd.eu/api/billing/webhook`, returning to
  `https://app.kinnd.eu/billing`). There's nothing to configure in the QuickPay
  manager beyond the keys.
- In the QuickPay manager, set the shop name customers see in the payment
  window to **Kinnd**. It currently shows "WURK".
- **Test vs live.** The merchant account is live and has *allow test
  transactions* switched on. So it takes real cards and also the published
  test cards (https://learn.quickpay.net/tech-talk/appendixes/test/).
  - In production the API refuses a test-card authorisation: the checkout ends
    as declined and the plan isn't activated. Set
    `QUICKPAY_ACCEPT_TEST_CARDS=true` only while testing a deployment, then
    remove it and restart.
  - **At launch, switch *allow test transactions* off** in the QuickPay manager.
  - A real card is charged for real. Test with test cards only.
- **Payment status is confirmed twice, safely:** once when the customer returns
  (`POST /billing/confirm`) and once by QuickPay's callback. The first period
  is charged exactly once, whichever arrives first. The nightly reconciliation
  does the same for a checkout whose callback never arrived.
- `BILLING_TEST_MODE=true` bypasses payment completely: paid plans switch on
  without charging. Use it only while a deployment is being tested.

### 4.4 Web Push
Generate the VAPID keys once (§3). Push works in the installed PWA (home
screen) on iOS 16.4+ and in Android browsers.

## 5. First-time setup

### 5.1 Plesk: subdomain, aliases and TLS
`kinnd.eu` itself is the promotional website (separate scope). The app is the
subdomain `app.kinnd.eu`.

1. **Websites & Domains → app.kinnd.eu → Hosting settings:**
   - Document root: **`app/apps/web/dist`**. The subdomain's folder is `SITE`
     (`/var/www/vhosts/kinnd.eu/app`), and nginx serves the built app from
     inside it.
2. **Aliases** `app.kinnd.org` and `app.kinnd.net`, each with a **301
   redirect** to `https://app.kinnd.eu`:
   - The DNS zones for `kinnd.org` and `kinnd.net` need an `app` record (A/AAAA
     or CNAME) pointing at this server.
   - In Plesk: **Add Domain Alias** with `app.kinnd.eu` as the primary site,
     and tick *Redirect with the HTTP 301 code*.
   - If your Plesk only allows aliases of main domains, create `app.kinnd.org`
     and `app.kinnd.net` as subdomains of `kinnd.org` / `kinnd.net` instead.
     Give each one *Hosting type → Forwarding*, with *Moved permanently (301)*
     to `https://app.kinnd.eu`.
3. **SSL/TLS Certificates → Let's Encrypt:** a certificate for `app.kinnd.eu`,
   and one for each alias (a redirect over HTTPS still needs a valid
   certificate). Tick *Redirect from HTTP to HTTPS*.
4. **Apache & nginx settings (app.kinnd.eu):** turn **off** *Proxy mode*, so
   nginx serves the static app itself. Add the directives in §5.6 once the
   build exists.

Check the redirects once DNS has propagated:
```bash
curl -sI https://app.kinnd.org | grep -i "^HTTP\|^location"   # 301 → https://app.kinnd.eu/
curl -sI https://app.kinnd.net | grep -i "^HTTP\|^location"   # 301 → https://app.kinnd.eu/
```

### 5.2 Database and Redis
```sql
-- as the postgres superuser
CREATE ROLE kinnd LOGIN PASSWORD '<password>' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE kinnd OWNER kinnd;
```
Redis: persistence on (`appendonly yes`), bound to `127.0.0.1`.

### 5.3 Code
The code arrives through **Plesk's Git extension**, which keeps the git
repository itself and copies the files of the chosen branch into `REPO`.
`REPO` is outside every document root, so the source is never web-served.

1. Create the folder, so Plesk's folder picker can show it:
   ```bash
   mkdir -p /var/www/vhosts/kinnd.eu/repo
   chown "$(stat -c %U /var/www/vhosts/kinnd.eu/app)":psacln /var/www/vhosts/kinnd.eu/repo
   ```
2. **Plesk → kinnd.eu → Git → Add Repository** (remote,
   `git@github.com:wurkagency/kinnd.git`). Plesk shows an SSH key: add it on
   GitHub under **wurkagency/kinnd → Settings → Deploy keys**, read-only.
3. **Repository settings:**
   - Branch: `v3.0`
   - Deployment mode: **Manual**, so you choose when a version lands
   - Deployment path: **`/repo`**. That's the folder next to `httpdocs` and
     `app`, **never** `httpdocs`, which would publish the source code on the
     website.
4. **Pull updates**, then **Deploy**. Check: `ls /var/www/vhosts/kinnd.eu/repo`
   lists `apps`, `packages`, `ecosystem.config.cjs` and so on.
5. Media folders, and the copy into `SITE`:

```bash
mkdir -p /var/www/vhosts/kinnd.eu/media /var/www/vhosts/kinnd.eu/media-tmp
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env*' \
  /var/www/vhosts/kinnd.eu/repo/ /var/www/vhosts/kinnd.eu/app/
```
Plesk may put a default `index.html` and other files in the new `app` folder. Remove
them before the first `rsync`, but keep `apps/api/.env` if you already made it.

Now create `app/apps/api/.env` from §3.1. If you are moving the v2 data,
read §6 first: it needs the v2 medical key.

### 5.4 Build and migrate
```bash
cd /var/www/vhosts/kinnd.eu/app
npm ci
npx dotenv -e apps/api/.env -- npm run build
npx dotenv -e apps/api/.env -- npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
npm run budget   # optional: checks the built app against the performance budget
```

### 5.5 Check row-level security
The API's safety depends on Postgres enforcing RLS for the app's role:

```bash
cat > /tmp/rls_check.sql <<'SQL'
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user;
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
 WHERE relname IN ('growth_entries','medical_info','journal_posts','media_assets');
SQL
npx dotenv -e apps/api/.env -- sh -c 'psql "$DATABASE_URL" -f /tmp/rls_check.sql'
```
Expect `rolbypassrls = f` and `rolsuper = f`, and both security columns `t` on
every row.

### 5.6 nginx directives
**Apache & nginx settings → Additional nginx directives:**

```nginx
# The API, same origin, under /api. It listens on 127.0.0.1 only: always
# proxy to 127.0.0.1:4000, never "localhost" (which can resolve to ::1).
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
    client_max_body_size 60m;       # the API's limit is 50 MB per file
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

- **If Plesk rejects `location /` as a duplicate** (some versions add their
  own):
  - Drop that block and add `error_page 404 = /index.html;` instead.
  - Put its seven `add_header … always;` lines at the top level, outside any
    location, so every response gets them.
- **HSTS `includeSubDomains`** makes browsers use HTTPS on every subdomain,
  including any below `app.kinnd.eu`. Give every such host a certificate before it
  goes live.

Check that the headers arrive:
```bash
curl -sI https://app.kinnd.eu/calendar | grep -iE "content-security-policy|strict-transport|x-frame-options"
```

**What the headers do:**
- **Content-Security-Policy:** only Kinnd's own code runs on the page, with no
  outside scripts or `eval`, which contains the damage of any XSS bug.
- **`frame-ancestors 'none'` and `X-Frame-Options`:** no other site can frame
  the app to trick a parent into tapping "Delete account".
- **HSTS:** browsers always use HTTPS.

**What the API adds:**
- **CSRF:** every POST/PATCH/PUT/DELETE must carry the header
  `X-Kinnd-Client: 1`. The app always sends it; another site can't. The
  QuickPay callback is exempt because it is signed.
- **Sign-in limits:**
  - 20 attempts per IP per endpoint every 15 minutes.
  - 10 wrong passwords for an account lock its password sign-in for 15
    minutes.
- **Sessions** stay valid for 90 days after their last use. Signing out, a
  password change and "sign out other devices" end them straight away.
- **Signing out** sends `Clear-Site-Data: "cache"`, so photos cached on the
  phone are gone for the next person using it.

### 5.7 Permissions
nginx runs as its own user and must be able to read the build:
```bash
PLESK_USER=$(stat -c %U /var/www/vhosts/kinnd.eu/app)
chmod o+x /var/www/vhosts/kinnd.eu /var/www/vhosts/kinnd.eu/app
chown -R "$PLESK_USER":psacln /var/www/vhosts/kinnd.eu/app/apps/web/dist/
chmod -R o+rX /var/www/vhosts/kinnd.eu/app/apps/web/dist/
chmod 700 /var/www/vhosts/kinnd.eu/media /var/www/vhosts/kinnd.eu/media-tmp
chmod 600 /var/www/vhosts/kinnd.eu/app/apps/api/.env
```

### 5.8 Start the processes
```bash
cd /var/www/vhosts/kinnd.eu/app
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup      # run the command it prints, so PM2 starts on boot
```
`ecosystem.config.cjs` is in the repository. It starts `kinnd-api` and
`kinnd-worker`, and both read `apps/api/.env`.

### 5.9 Smoke test
```bash
curl -sI https://app.kinnd.eu/ | head -1            # 200
curl -s  https://app.kinnd.eu/api/health            # {"status":"ok",…}
curl -sI https://app.kinnd.eu/calendar | head -1    # 200 (SPA fallback)
pm2 status                                      # both online
pm2 logs kinnd-worker --lines 20 --nostream     # "… worker ready" lines, no errors
```
Then do the manual checks in §7.2.

## 6. Moving the v2 data across (one time)

Skip this section for a clean start with no old data. Otherwise, the v2
database and media move from the old `kidcom.org` subscription into Kinnd.
Plan about an hour, done out of hours.

1. **Stop v2 and back it up.** This is the rollback point.
   ```bash
   pm2 stop all   # on the v2 install, or stop its processes by name
   pg_dump -Fc "<v2 DATABASE_URL>" > /root/backup/v2-final-$(date +%F).dump
   tar czf /root/backup/v2-media-$(date +%F).tgz -C <v2 MEDIA_STORAGE_PATH> .
   ```
   `pm2 stop all` stops every PM2 process on the server. If anything else runs
   under PM2, stop the v2 processes by name instead (`pm2 status` lists them).
2. **Restore into the new database** (§5.2 created it empty):
   ```bash
   pg_restore --no-owner --role=kinnd -d "postgresql://kinnd:<password>@localhost:5432/kinnd" /root/backup/v2-final-$(date +%F).dump
   ```
3. **Copy the media** into `MEDIA`:
   ```bash
   tar xzf /root/backup/v2-media-$(date +%F).tgz -C /var/www/vhosts/kinnd.eu/media
   chmod 700 /var/www/vhosts/kinnd.eu/media
   ```
4. **Carry over the medical key.** Put the v2 `MEDICAL_INFO_ENCRYPTION_KEY`
   into the new `.env`.
   - If v2 never set it, the value is `dev-only-medical-encryption-key-change-me`.
   - If the v2 value is weak, the API refuses to start. Then follow §8.5 to
     move to a new key: the new key goes in `MEDICAL_INFO_ENCRYPTION_KEY`, the
     v2 value in `MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS`, then re-encrypt.
   - `MEDIA_ENCRYPTION_KEY` is new: v2 media wasn't encrypted.
5. **Build, migrate and start** as in §5.4–5.9. `migrate deploy` applies every
   v3 migration. They are additive: data is kept, and tables are renamed
   through Prisma mappings, not dropped.
6. **Encrypt the media** (safe to re-run; files not yet converted are still
   served until it finishes):
   ```bash
   cd /var/www/vhosts/kinnd.eu/app
   npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --dry-run
   npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --reprocess
   ```
   `--reprocess` also adds capture metadata and the location-free copies for
   older uploads.
7. **Launch reset (subscription model D8).** Every v2 user and their data is
   removed except `charlie@wurk.dk`, which keeps its children. QuickPay
   subscriptions of the removed users are cancelled before anything is
   deleted.
   ```bash
   npx dotenv -e apps/api/.env -- npm run reset:launch --workspace=apps/api                # report only
   npx dotenv -e apps/api/.env -- npm run reset:launch --workspace=apps/api -- --confirm   # do it
   ```
   Then give the kept account its Circle with the lifetime coupon (§8.7):
   create it, sign in, and redeem it on Plan & billing.
8. **Old domains.** Redirect `app.kidcom.org` and `api.kidcom.org` with a 301
   to `https://app.kinnd.eu`, and `kidcom.org` / `www.kidcom.org` to
   `https://kinnd.eu`, or retire them. Installed v2 home-screen apps
   stop working either way; users reinstall from `app.kinnd.eu`.
9. Verify with §7.2. Keep the v2 backups for at least 30 days.

## 7. Every deploy

### 7.1 Routine
First, in **Plesk → kinnd.eu → Git**, click **Pull updates** and then
**Deploy**, which puts the new version into `REPO`. Then:

```bash
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env*' \
  /var/www/vhosts/kinnd.eu/repo/ /var/www/vhosts/kinnd.eu/app/

cd /var/www/vhosts/kinnd.eu/app
rm -rf tasks docs README.md docker-compose.yml .env.example
npm ci
npx dotenv -e apps/api/.env -- npm run build
npx dotenv -e apps/api/.env -- npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

PLESK_USER=$(stat -c %U /var/www/vhosts/kinnd.eu/app)
chmod o+x /var/www/vhosts/kinnd.eu /var/www/vhosts/kinnd.eu/app
chown -R "$PLESK_USER":psacln apps/web/dist/
chmod -R o+rX apps/web/dist/

pm2 restart ecosystem.config.cjs
curl -sI https://app.kinnd.eu/ | head -1 && curl -s https://app.kinnd.eu/api/health
```

- Keep `scripts/`: the build and the `budget` check use it.
- Migrations always run **before** the restart. They are forward-only and
  written so the running version keeps working in the seconds in between.
- Before a release with migrations, take a database dump (§8.3).
- Installed apps update themselves: the service worker picks up the new build
  on the next launch.

### 7.2 After a deploy: manual checks
1. Sign in with a password; a 6-digit code arrives by email from
   `no-reply@kinnd.eu`.
2. Sign in with Google and with Microsoft; you land in the app, not on an error.
3. Sign up with a new number; the SMS code arrives from "Kinnd".
4. Open Today, Calendar, Moments and Lists, and view a photo and a video.
5. Upload a photo; after processing, the other parent can open it.
6. Profile → Preferences → Notifications: turn on push, then send a message
   from another account; the push arrives.
7. **Plans:** Plan & billing shows Single / Parent Circle DKK 39 / Family
   Circle DKK 69. Start a trial and check the trial banner.
8. **Checkout with a test card** (only while `QUICKPAY_ACCEPT_TEST_CARDS=true`).
   You enter the card on QuickPay's page yourself. Afterwards:
   - the plan shows Active, with a renewal date
   - in the QuickPay manager, the subscription shows **one** captured payment
     of the right amount

   Then remove `QUICKPAY_ACCEPT_TEST_CARDS` and `pm2 restart ecosystem.config.cjs`.

## 8. Operations

### 8.1 Logs
```bash
pm2 logs kinnd-api --lines 100
pm2 logs kinnd-worker --lines 100
tail -f /var/www/vhosts/system/app.kinnd.eu/logs/proxy_error_log   # nginx
```

### 8.2 Scheduled jobs (worker, Copenhagen time)
| When | Job |
|---|---|
| hourly | Appointment reminders (next 24 h) |
| 03:00 | Billing: trial reminders (7 and 1 days before), trials ending (charge the card on file or end the Circle), renewals (a declined charge ends the Circle straight away), cancelled Circles past their paid period, suspension notices (days 0, 30, 83), and deletion of suspended children on day 90. Nothing under an active alarm is ever deleted. |
| 03:30 | Reconcile checkouts left pending for more than 24 h |
| 04:00 | Purge: deleted children past the restore window, login events older than 12 months, notifications and the SMS send log older than 90 days, media scratch files |

**Alert:** `pm2 logs kinnd-api --nostream | grep ALERT` shows when the SMS
daily limit was reached, which is a sign of SMS pumping. Check `sms_sends`
(numbers and countries) before raising `SMS_DAILY_LIMIT`.

### 8.3 Backups
- **Database:** nightly `pg_dump -Fc`, kept for 30 days and copied off the
  server. Also take one before every release with migrations:
  ```bash
  npx dotenv -e apps/api/.env -- sh -c 'pg_dump -Fc "$DATABASE_URL"' > /root/backup/kinnd-$(date +%F-%H%M).dump
  ```
- **Media:** nightly `rsync` of `MEDIA` to off-server storage. The files are
  encrypted, so the copy is safe at rest.
- **Keys:** `MEDIA_ENCRYPTION_KEY` and `MEDICAL_INFO_ENCRYPTION_KEY` go in the
  password manager and offline, never beside the backups.
- **Restore test:** quarterly, restore into a scratch database and media
  folder, then open a photo.

### 8.4 Rotating the media key
1. Put the new key in `MEDIA_ENCRYPTION_KEY` and the old one in
   `MEDIA_ENCRYPTION_KEYS_PREVIOUS` (comma-separate several). Restart.
2. Rewrap the files. This rewrites only each file's 93-byte header, so it's
   quick:
   ```bash
   npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --rewrap
   ```
3. Run it again. When it reports `0 re-wrapped`, remove the old key, restart,
   and destroy the old key's copies.

### 8.5 Rotating the medical-info key
1. Generate the new key: `openssl rand -hex 32`.
2. In `apps/api/.env`, set `MEDICAL_INFO_ENCRYPTION_KEY` to the new key.
   Put the old value in `MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS`
   (comma-separate several).
3. `pm2 restart ecosystem.config.cjs`. Old values can still be read, and
   everything new is written with the new key.
4. Re-encrypt:
   ```bash
   npx dotenv -e apps/api/.env -- npm run medical:rekey --workspace=apps/api -- --dry-run
   npx dotenv -e apps/api/.env -- npm run medical:rekey --workspace=apps/api
   ```
5. Run it again. When it reports `0 value(s) re-encrypted, 0 unreadable`:
   - Empty `MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS`, restart, and destroy copies
     of the old key.
   - "Unreadable" means a value's key is in neither variable. Find the right
     old key before removing anything.

### 8.6 Personal data
- Account deletion, retention periods and the family-circle removal procedure
  are in `docs/data_retention_policy.md`.
- Data kept for abuse checks (IPs, capture metadata, sign-in events) is in
  `docs/management_data.md`. It is never shown in the app. The management
  portal on `manage.kinnd.eu` will read it; that is a separate SoW.

### 8.7 Plans, coupons and legal hold
**Coupons.** A lifetime coupon gives the Circle that redeems it a tier for
good, with no card and no renewals. The code is printed once.
```bash
npx dotenv -e apps/api/.env -- npm run coupon --workspace=apps/api -- create --tier FAMILY --max 20 --note "Internal testing and family"
npx dotenv -e apps/api/.env -- npm run coupon --workspace=apps/api -- list
npx dotenv -e apps/api/.env -- npm run coupon --workspace=apps/api -- deactivate KC-XXXX-XXXX
```
- `--code` sets a code of your own, e.g. `--code KC-9GYC-Y46E` for the internal
  code used in development.
- Deactivating stops new redemptions; Circles already on the coupon keep their
  plan.

**Legal hold (alarms).** Until the management portal has a screen for this:
- An active alarm hides the media, child or user's data from the app for
  everyone and blocks every deletion.
- Archiving the alarm releases the data to the normal rules.
```bash
npx dotenv -e apps/api/.env -- npm run alarm --workspace=apps/api -- create --media <mediaAssetId> --reason "..."
npx dotenv -e apps/api/.env -- npm run alarm --workspace=apps/api -- archive <alarmId>
npx dotenv -e apps/api/.env -- npm run alarm --workspace=apps/api -- list
```

**Suspended children.** When nobody pays for a child that the free Single plan
can't hold, the child is hidden for everyone and deleted on day 90. Paying, or
another parent taking the child over, restores it straight away.

## 9. Rollback

- **Code only** (no new migrations in the release): revert the release on
  GitHub (`git revert <commit>` locally, then push to `v3.0`). Then run §7.1:
  Plesk → Git → Pull updates → Deploy, then the commands. You can skip the
  migrate step.
- **The release included migrations:** they are forward-only.
  1. Restore the pre-deploy dump:
     `pg_restore --clean --no-owner -d "$DATABASE_URL" <dump>`
  2. Revert the code on GitHub as above, then run §7.1 without the migrate
     step.
  - Media written since the dump keeps working: it's encrypted with the same
    key.
  - Rows created after the dump are lost.

## 10. Known gotchas

- **`git clone`/`git pull` in the terminal says "Permission denied
  (publickey)":** expected. Only Plesk's Git extension has the deploy key;
  deploy through Plesk → Git.
- **Plesk's Pull fails with "Permission denied (publickey)":** Plesk's SSH key
  isn't (or is no longer) a deploy key on `wurkagency/kinnd`. Copy it from the
  repository's settings in Plesk and add it on GitHub again.
- **`ls REPO` shows old files after a deploy:** you pulled but didn't click
  **Deploy**, or the deployment path isn't `/repo`.
- **The app returns 403/500 but the API is fine:** almost always permissions.
  The build runs as root, so nginx can't read `dist`.
  - Re-run the lines in §5.7.
  - Plesk can silently reset the `app` folder to `750`.
  - To confirm, look for `Permission denied` in `proxy_error_log`.
- **Plesk's default page shows instead of the app:** the document root isn't
  `app/apps/web/dist` (§5.1).
- **Sign-in "works" but you land signed out:** the session cookie isn't kept.
  Check that:
  - the site is HTTPS
  - nginx sends `X-Forwarded-Proto`
  - `COOKIE_DOMAIN` is unset, or exactly `app.kinnd.eu`
- **Signed in on app.kinnd.eu but signed out after an app.kinnd.org link:**
  expected. The alias redirects to `app.kinnd.eu`, and the cookie lives only
  there. Always link to `app.kinnd.eu`.
- **Google or Microsoft sign-in ends on an error page:** the redirect URI isn't
  registered exactly as in §4.1, or `OAUTH_REDIRECT_BASE` is wrong.
- **Invite emails or QuickPay return to the wrong site:** the first entry of
  `CORS_ORIGIN` must be `https://app.kinnd.eu`.
- **Photos stay "processing":** the worker isn't running or Redis is down.
  Check `pm2 status` and `pm2 logs kinnd-worker`.
- **"Missing required environment variable":** `apps/api/.env` is missing, or
  PM2 was started from the wrong folder. Always use `SITE/ecosystem.config.cjs`.
- **"… must be a random secret of at least 32 characters in production":** a
  key is a placeholder, a development default or too short. See §3, and §8.5
  for the medical key.
- **"SMTP_HOST, SMTP_USER and SMTP_PASS are required in production":** set the
  Brevo SMTP relay (§3.1).
- **nginx returns 502 for `/api`:** `proxy_pass` points at `localhost` or a
  public address, or `kinnd-api` isn't running. The API listens on
  `127.0.0.1:4000` only.
- **Requests return 403 `CLIENT_HEADER_REQUIRED`:** the caller didn't send
  `X-Kinnd-Client: 1`. The app always sends it; scripts and `curl` must add it.
- **A test-card checkout ends as declined:** expected in production unless
  `QUICKPAY_ACCEPT_TEST_CARDS=true` (§4.3).
- **A parent is locked out ("Too many attempts"):** 10 wrong passwords within
  15 minutes. It clears by itself after 15 minutes; a password reset works
  straight away.
- **After changing `.env`:** `pm2 restart ecosystem.config.cjs`, so both
  processes reload it.
