# KidCom v3.0 — Deployment (quick)

Commands only. Explanations are in [`deployment_guide.md`](deployment_guide.md).
`APP_HOST` = `app.kidcom.org`.

## Every deploy

```bash
git -C /var/www/vhosts/kidcom.org/api pull
```

```bash
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env*' /var/www/vhosts/kidcom.org/api/ /var/www/vhosts/kidcom.org/httpdocs/
```

```bash
cd /var/www/vhosts/kidcom.org/httpdocs && rm -rf tasks docs README.md docker-compose.yml .env.example && npm ci && npx dotenv -e apps/api/.env -- npm run build
```

```bash
npx dotenv -e apps/api/.env -- npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

```bash
chmod o+x /var/www/vhosts/kidcom.org /var/www/vhosts/kidcom.org/httpdocs && chown -R kidcom.org:psacln /var/www/vhosts/kidcom.org/httpdocs/apps/web/dist/ && chmod -R o+rX /var/www/vhosts/kidcom.org/httpdocs/apps/web/dist/
```

```bash
pm2 restart ecosystem.config.cjs
```

```bash
curl -sI https://app.kidcom.org/ | head -1 && curl -s https://app.kidcom.org/api/health && pm2 status
```

## Before a release with migrations

```bash
pg_dump -Fc "$DATABASE_URL" > /root/backup/kidcom-$(date +%F-%H%M).dump
```

## One-time: upgrade v2 → v3.0

1. Back up the database and media:
```bash
pg_dump -Fc "$DATABASE_URL" > /root/backup/kidcom-pre-v3-$(date +%F).dump
```
```bash
tar czf /root/backup/media-pre-v3-$(date +%F).tgz -C /var/www/vhosts/kidcom.org/media .
```
2. Plesk → `app.kidcom.org`:
   - Let's Encrypt, with the HTTP→HTTPS redirect on
   - Document root `httpdocs/apps/web/dist`
   - Proxy mode **off**
   - Additional nginx directives: the block below
3. `apps/api/.env`: set
   - `CORS_ORIGIN`, `COOKIE_DOMAIN`, `API_BASE_URL`, `OAUTH_REDIRECT_BASE`,
     all for `app.kidcom.org`
   - `MEDIA_ENCRYPTION_KEY`, `MEDIA_TEMP_PATH`, `BILLING_TEST_MODE`,
     `SMS_DELIVERY=brevo`, `BREVO_*`
4. Google and Microsoft consoles: add
   - `https://app.kidcom.org/api/auth/oauth/google/callback`
   - `https://app.kidcom.org/api/auth/oauth/microsoft/callback`
5. Switch the checkout to v3.0:
```bash
git -C /var/www/vhosts/kidcom.org/api fetch && git -C /var/www/vhosts/kidcom.org/api checkout v3.0
```
6. Run **Every deploy** above, then replace the PM2 processes:
```bash
pm2 delete all && cd /var/www/vhosts/kidcom.org/httpdocs && pm2 start ecosystem.config.cjs && pm2 save
```
7. Encrypt the existing media:
```bash
npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --dry-run
```
```bash
npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --reprocess
```
8. Redirect `www.kidcom.org` with a 301 to `https://app.kidcom.org`.

### nginx directives (app.kidcom.org)

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:4000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_read_timeout 300s;
    client_max_body_size 60m;
}
location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }
location = /sw.js { add_header Cache-Control "no-cache"; try_files $uri =404; }
location = /index.html { add_header Cache-Control "no-cache"; }
location / { try_files $uri $uri/ /index.html; }
```

If Plesk rejects `location /`, replace that line with:

```nginx
error_page 404 = /index.html;
```

## One-time: fresh server

```sql
CREATE ROLE kidcom LOGIN PASSWORD '<password>' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE kidcom OWNER kidcom;
```

```bash
git clone git@github.com:wurkagency/kidcom.git /var/www/vhosts/kidcom.org/api && git -C /var/www/vhosts/kidcom.org/api checkout v3.0
```

```bash
mkdir -p /var/www/vhosts/kidcom.org/media /var/www/vhosts/kidcom.org/media-tmp && chmod 700 /var/www/vhosts/kidcom.org/media /var/www/vhosts/kidcom.org/media-tmp
```

```bash
openssl rand -hex 32; openssl rand -hex 32; openssl rand -hex 32; npx web-push generate-vapid-keys
```

Create `httpdocs/apps/api/.env` from the template in the full guide (§3.1), then:

```bash
chmod 600 /var/www/vhosts/kidcom.org/httpdocs/apps/api/.env
```

Run **Every deploy**, then:

```bash
cd /var/www/vhosts/kidcom.org/httpdocs && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```

## Checks

RLS (expect `f`, `f`, then `t` / `t` on every row):
```bash
printf "SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user;\nSELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('growth_entries','medical_info','journal_posts','media_assets');\n" > /tmp/rls_check.sql && npx dotenv -e apps/api/.env -- sh -c 'psql "$DATABASE_URL" -f /tmp/rls_check.sql'
```

Performance budget:
```bash
npm run budget
```

Logs:
```bash
pm2 logs kidcom-api --lines 100
```
```bash
pm2 logs kidcom-worker --lines 100
```

After each deploy:
- password sign-in and its email code
- Google and Microsoft sign-in
- an SMS code at sign-up
- photo upload, seen by the other parent
- a push notification
- a test-card checkout: QuickPay shows **one** payment

## Rollback

Code only:
```bash
git -C /var/www/vhosts/kidcom.org/api checkout <previous-commit>
```
Then run **Every deploy** without the migrate step.

With migrations:
```bash
pg_restore --clean -d "$DATABASE_URL" /root/backup/<dump-file>
```
Then check out the previous commit and run **Every deploy** without the migrate step.

## Rotate the media key

1. Set `MEDIA_ENCRYPTION_KEY` to the new key and `MEDIA_ENCRYPTION_KEYS_PREVIOUS` to the old one. Then:
```bash
pm2 restart ecosystem.config.cjs
```
2. Rewrap, repeating until it reports `0 re-wrapped`:
```bash
npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --rewrap
```
3. Clear `MEDIA_ENCRYPTION_KEYS_PREVIOUS`, then:
```bash
pm2 restart ecosystem.config.cjs
```
