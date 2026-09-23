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

## Media encryption (at rest)

Every photo and video (originals, WebP/poster derivatives, playback
transcodes, location-free copies) is encrypted on disk with AES-256-GCM:
each file has its own random key, wrapped by the master key
`MEDIA_ENCRYPTION_KEY` and kept in the file's header, and the content is
sealed in 64 KB chunks so video seeking decrypts only what's played
(`apps/api/src/lib/mediaCrypto.ts`, format described at the top).

**The master key is the one thing that must never be lost: without it every
photo and video is unrecoverable, and a backup of the media folder is useless.**

- Generate once: `openssl rand -hex 32`. Set it in `apps/api/.env` for both the
  API and the worker (PM2 `ecosystem.config.cjs` reads the same file). The API
  refuses to start in production without it.
- Back it up **apart from** the media and the database backups (e.g. the company
  password manager, plus a sealed offline copy). A backup holding both the media
  and the key protects nothing.
- `MEDIA_TEMP_PATH` (optional) is the worker's plaintext scratch area while
  sharp/ffmpeg run; files there are 0600 and deleted after each step and on
  every worker start. Keep it on local disk, never on a backed-up share.

### First deploy with encryption (existing plaintext media)

```bash
cd /var/www/vhosts/kidcom.org/httpdocs
npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --dry-run
npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --reprocess
```

`--reprocess` also backfills capture metadata and the location-free copies for
uploads made before that existed. Until the script has run, unconverted files
are still served (read as plaintext). Safe to re-run.

### Rotating the master key

1. Put the new key in `MEDIA_ENCRYPTION_KEY` and the old one in
   `MEDIA_ENCRYPTION_KEYS_PREVIOUS` (comma-separated for several); restart API + worker.
2. `npx dotenv -e apps/api/.env -- npm run media:encrypt --workspace=apps/api -- --rewrap`
   — rewrites only each file's 93-byte header, so it's quick.
3. Run it again: when it reports `0 re-wrapped`, remove the old key from
   `MEDIA_ENCRYPTION_KEYS_PREVIOUS`, restart, and destroy the old key's copies.

### Not end-to-end

The server can decrypt media (it makes thumbnails, playable videos and
download zips). End-to-end encryption was considered and rejected
(`tasks/todo.md` → Decisions): it would move all processing onto phones and
need per-family key sharing and recovery.

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
