# Plesk deployment — verified routine

`DEPLOYMENT.md` (repo root) describes the *intended* Plesk setup. In practice
the real git checkout lives at `/var/www/vhosts/kidcom.org/api/`, not
`httpdocs/` — no Plesk deploy action syncs one into the other, that's a
manual step below. This file is the routine actually verified working
end-to-end (2026-09-17 deploy).

## Collected deployment
git -C /var/www/vhosts/kidcom.org/api pull
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env*' /var/www/vhosts/kidcom.org/api/ /var/www/vhosts/kidcom.org/httpdocs/
cd /var/www/vhosts/kidcom.org/httpdocs && rm -rf tasks docs DEPLOYMENT.md README.md scripts docker-compose.yml .env.example && npm install && npx dotenv -e apps/api/.env -- npm run build
npx dotenv -e apps/api/.env -- npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
chmod o+x /var/www/vhosts/kidcom.org /var/www/vhosts/kidcom.org/httpdocs && chown -R kidcom.org:psacln /var/www/vhosts/kidcom.org/httpdocs/apps/web/dist/ && chmod -R o+rX /var/www/vhosts/kidcom.org/httpdocs/apps/web/dist/
pm2 restart ecosystem.config.cjs && curl -sI https://www.kidcom.org/ | head -1 && curl -s https://api.kidcom.org/health


## Every deploy

```bash
git -C /var/www/vhosts/kidcom.org/api pull
```

```bash
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env*' /var/www/vhosts/kidcom.org/api/ /var/www/vhosts/kidcom.org/httpdocs/
```

```bash
cd /var/www/vhosts/kidcom.org/httpdocs
rm -rf tasks docs DEPLOYMENT.md README.md scripts docker-compose.yml .env.example
npm install
npx dotenv -e apps/api/.env -- npm run build
```

```bash
npx dotenv -e apps/api/.env -- npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

```bash
chmod o+x /var/www/vhosts/kidcom.org /var/www/vhosts/kidcom.org/httpdocs
chown -R kidcom.org:psacln /var/www/vhosts/kidcom.org/httpdocs/apps/web/dist/
chmod -R o+rX /var/www/vhosts/kidcom.org/httpdocs/apps/web/dist/
```

```bash
pm2 restart ecosystem.config.cjs
```

```bash
curl -sI https://www.kidcom.org/ | head -1
curl -s https://api.kidcom.org/health
```

## Known gotchas

- **`git -C .../api pull` fails with "local changes would be overwritten"**:
  `apps/web/tsconfig.tsbuildinfo` and `package-lock.json` drift from prior
  local `npm install`/build runs in that checkout. Safe to discard:
  `git -C /var/www/vhosts/kidcom.org/api stash`, then retry the pull.

- **`https://www.kidcom.org/` returns 500 after a deploy, API is fine**:
  almost always permissions. The build runs as `root`, so `apps/web/dist/`'s
  contents come out `root:root` — nginx's worker runs as its own `nginx`
  system user, not `kidcom.org`, and can't read them. The `chmod`/`chown`
  block above fixes this. Check `/var/www/vhosts/system/kidcom.org/logs/proxy_error_log`
  for `openat() ... Permission denied` to confirm.

- **The 500 comes back on a *later* deploy even though the same chmod ran
  before**: `/var/www/vhosts/kidcom.org/httpdocs` itself (not just
  `apps/web/dist/`) can silently revert to `750` (no "other" access) between
  deploys — cause not fully root-caused, but it's cheap to just always
  include `chmod o+x` on both `/var/www/vhosts/kidcom.org` and `.../httpdocs`
  in every deploy rather than assume it stuck from last time. That's why
  it's in the "every deploy" block above, not a one-time setup step.

- **RLS sanity check** (only needed after a migration that touches RLS
  policies, not every deploy) — `prisma db execute` does not print `SELECT`
  output, use `psql` directly:

  ```bash
  cat > /tmp/rls_check.sql <<'SQL'
  SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user;
  SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('growth_entries','medical_info','journal_posts');
  SQL
  npx dotenv -e apps/api/.env -- sh -c 'psql "$DATABASE_URL" -f /tmp/rls_check.sql'
  ```

  Expect `rolbypassrls=f`, `rolsuper=f`, both security columns `t`.

- **`apps/api/.env`** lives only on the server (gitignored) — created once,
  never touched by the routine above. If it's ever missing, rebuild it from
  `DEPLOYMENT.md`'s step 2.
