# Kinnd v3.0 — Deployment (quick)

Commands only. Explanations are in [`deployment_guide.md`](deployment_guide.md).

| | |
|---|---|
| App + API | `https://app.kinnd.eu` (API under `/api`; no `api.kinnd.eu`) |
| Aliases | `app.kinnd.org`, `app.kinnd.net`: 301 to `app.kinnd.eu` |
| `kinnd.eu` | promotional website; separate scope, not touched |
| Repo | `/var/www/vhosts/kinnd.eu/repo` |
| Site | `/var/www/vhosts/kinnd.eu/app` (the `app.kinnd.eu` subdomain's folder) |
| Media | `/var/www/vhosts/kinnd.eu/media` |
| Processes | PM2 `kinnd-api`, `kinnd-worker` (Redis queues; RabbitMQ not used) |
| `manage.kinnd.eu` | separate SoW; not touched |

## Every deploy

Plesk → kinnd.eu → **Git** → **Pull updates** → **Deploy** (into `/repo`). Then:

```bash
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env*' /var/www/vhosts/kinnd.eu/repo/ /var/www/vhosts/kinnd.eu/app/
```

```bash
cd /var/www/vhosts/kinnd.eu/app && rm -rf tasks docs README.md docker-compose.yml .env.example && npm ci && npx dotenv -e apps/api/.env -- npm run build
```

```bash
npx dotenv -e apps/api/.env -- npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

```bash
chmod o+x /var/www/vhosts/kinnd.eu /var/www/vhosts/kinnd.eu/app && chown -R "$(stat -c %U /var/www/vhosts/kinnd.eu/app)":psacln apps/web/dist/ && chmod -R o+rX apps/web/dist/
```

```bash
pm2 restart kinnd-api kinnd-worker --update-env
```

```bash
curl -sI https://app.kinnd.eu/ | head -1 && curl -s https://app.kinnd.eu/api/health && pm2 status
```

## Before a release with migrations

```bash
npx dotenv -e apps/api/.env -- sh -c 'pg_dump -Fc "$DATABASE_URL"' > /root/backup/kinnd-$(date +%F-%H%M).dump
```

## First time (fresh server)

1. **Plesk → app.kinnd.eu** (subdomain, folder `app`):
   - Hosting settings: document root `app/apps/web/dist`
   - Aliases `app.kinnd.org` and `app.kinnd.net` (an `app` DNS record in each
     zone): 301 to `https://app.kinnd.eu`
   - Let's Encrypt for `app.kinnd.eu` and each alias; HTTP→HTTPS on
   - Apache & nginx settings: Proxy mode **off**; additional nginx directives
     from guide §5.6
2. **Database:**
```sql
CREATE ROLE kinnd LOGIN PASSWORD '<password>' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE kinnd OWNER kinnd;
```
3. **Code and folders:**
```bash
mkdir -p /var/www/vhosts/kinnd.eu/repo && chown "$(stat -c %U /var/www/vhosts/kinnd.eu/app)":psacln /var/www/vhosts/kinnd.eu/repo
```
   Plesk → kinnd.eu → **Git** → repository `git@github.com:wurkagency/kinnd.git`
   (Plesk's SSH key added on GitHub as a read-only deploy key):
   - branch `v3.0`, deployment mode Manual, deployment path **`/repo`** (never
     `httpdocs`)
   - **Pull updates** → **Deploy**; `ls /var/www/vhosts/kinnd.eu/repo` shows
     `apps`, `packages`, …
```bash
mkdir -p /var/www/vhosts/kinnd.eu/media /var/www/vhosts/kinnd.eu/media-tmp && chmod 700 /var/www/vhosts/kinnd.eu/media /var/www/vhosts/kinnd.eu/media-tmp
```
```bash
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env*' /var/www/vhosts/kinnd.eu/repo/ /var/www/vhosts/kinnd.eu/app/
```
4. **`app/apps/api/.env`** from guide §3.1, then `chmod 600` it. Secrets:
```bash
openssl rand -hex 32   # SESSION_SECRET, MEDIA_ENCRYPTION_KEY, MEDICAL_INFO_ENCRYPTION_KEY (each its own)
```
```bash
npx web-push generate-vapid-keys
```
   - `CORS_ORIGIN=https://app.kinnd.eu`
   - `API_BASE_URL` and `OAUTH_REDIRECT_BASE`: `https://app.kinnd.eu/api`
   - **`COOKIE_DOMAIN`: leave unset**
   - `SMTP_FROM="Kinnd" <no-reply@kinnd.eu>`, `BREVO_SMS_SENDER=Kinnd`
5. Run the **Every deploy** commands (Plesk has already deployed), then:
```bash
cd /var/www/vhosts/kinnd.eu/app && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```
6. **RLS check** (expect `f | f`, then `t | t` on every row):
```bash
cat > /tmp/rls_check.sql <<'SQL'
SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user;
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
 WHERE relname IN ('medical_info','media_assets','journal_posts','growth_entries');
SQL
```
```bash
npx dotenv -e apps/api/.env -- sh -c 'psql "$DATABASE_URL" -f /tmp/rls_check.sql'
```
7. **Providers:**
   - Google/Microsoft redirect URIs:
     - `https://app.kinnd.eu/api/auth/oauth/google/callback`
     - `https://app.kinnd.eu/api/auth/oauth/microsoft/callback`
   - Brevo: verify `kinnd.eu` as a sender domain (SPF/DKIM/DMARC in Plesk DNS)
   - QuickPay: shop name "Kinnd"; *allow test transactions* **off** at launch

## One time: move the v2 data

Skip this for a clean start. Details: guide §6.

1. Stop the v2 processes by name (`pm2 status` lists them), then back up:
```bash
pg_dump -Fc "<v2 DATABASE_URL>" > /root/backup/v2-final-$(date +%F).dump && tar czf /root/backup/v2-media-$(date +%F).tgz -C <v2 MEDIA_STORAGE_PATH> .
```
2. Restore into `kinnd`, and copy the media:
```bash
pg_restore --no-owner --role=kinnd -d "postgresql://kinnd:<password>@localhost:5432/kinnd" /root/backup/v2-final-$(date +%F).dump
```
```bash
tar xzf /root/backup/v2-media-$(date +%F).tgz -C /var/www/vhosts/kinnd.eu/media
```
3. `.env`: set `MEDICAL_INFO_ENCRYPTION_KEY` to the **v2 value**. If v2 never
   set it, the value is `dev-only-medical-encryption-key-change-me`. If the API
   refuses the value as weak, follow **Rotate the medical-info key** below.
4. Run **Every deploy** (it migrates), then encrypt the media:
```bash
npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --dry-run
```
```bash
npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --reprocess
```
5. Launch reset (keeps `charlie@wurk.dk` only). Report first, then confirm:
```bash
npx dotenv -e apps/api/.env -- npm run reset:launch --workspace=apps/api
```
```bash
npx dotenv -e apps/api/.env -- npm run reset:launch --workspace=apps/api -- --confirm
```
6. Create the internal lifetime coupon, then sign in and redeem it on Plan &
   billing:
```bash
npx dotenv -e apps/api/.env -- npm run coupon --workspace=apps/api -- create --tier FAMILY --max 20 --code KC-9GYC-Y46E --note "Internal testing and family"
```
7. 301 `app.kidcom.org` and `api.kidcom.org` to `https://app.kinnd.eu`, and `kidcom.org` to `https://kinnd.eu`.

## After a deploy: check

1. Sign in with a password; the email code arrives.
2. Sign in with Google and with Microsoft.
3. Sign up with a new number; the SMS arrives.
4. Upload a photo, and view a photo and a video.
5. Push notifications arrive.
6. Plan & billing shows DKK 39 / 69, and a trial starts.
7. Test-card checkout, only while `QUICKPAY_ACCEPT_TEST_CARDS=true`. Remove the
   variable and restart afterwards.

## Operations

```bash
pm2 logs kinnd-api --lines 100
```
```bash
pm2 logs kinnd-worker --lines 100
```
```bash
tail -f /var/www/vhosts/system/app.kinnd.eu/logs/proxy_error_log
```
```bash
pm2 logs kinnd-api --nostream | grep ALERT
```

**Coupons:**
```bash
npx dotenv -e apps/api/.env -- npm run coupon --workspace=apps/api -- list
```
```bash
npx dotenv -e apps/api/.env -- npm run coupon --workspace=apps/api -- deactivate KC-XXXX-XXXX
```

**Legal hold:**
```bash
npx dotenv -e apps/api/.env -- npm run alarm --workspace=apps/api -- list
```

**Rotate the media key:** set the new key in `MEDIA_ENCRYPTION_KEY` and the old
one in `MEDIA_ENCRYPTION_KEYS_PREVIOUS`, restart, then run this until it
reports `0 re-wrapped`. Then remove the old key and restart.
```bash
npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --rewrap
```

**Rotate the medical-info key:** set the new key in
`MEDICAL_INFO_ENCRYPTION_KEY` and the old one in
`MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS`, restart, then run this until it
reports `0 … re-encrypted, 0 unreadable`. Then empty the previous-keys variable
and restart.
```bash
npx dotenv -e apps/api/.env -- npm run medical:rekey --workspace=apps/api
```

## Rollback

Code only (no migrations in the release): `git revert <commit>` locally, push
to `v3.0`, then run **Every deploy** (Plesk Pull → Deploy, then the commands;
you can skip the migrate step).

With migrations: restore the pre-deploy dump, then revert the code as above and
run **Every deploy** without the migrate step.
```bash
npx dotenv -e apps/api/.env -- sh -c 'pg_restore --clean --no-owner -d "$DATABASE_URL" /root/backup/<dump>'
```
