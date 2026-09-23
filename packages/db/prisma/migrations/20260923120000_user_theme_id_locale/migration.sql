-- v3.0: the per-user "skin" preference becomes the theme-kit "themeId"
-- (renamed, so existing choices carry over), plus a per-user UI locale.
ALTER TABLE "users" RENAME COLUMN "skinId" TO "themeId";
ALTER TABLE "users" ADD COLUMN "locale" TEXT;
