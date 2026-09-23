-- v3.0 Phase 4: moment category / location / date / family visibility,
-- media file facts for the download + details screens, bookmarks, and
-- emailed download links.

-- Moments
ALTER TABLE "journal_posts"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "occurredOn" DATE,
  ADD COLUMN "familyVisible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "journal_posts" ADD CONSTRAINT "journal_posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "journal_posts_categoryId_idx" ON "journal_posts"("categoryId");

-- A moment hidden from extended family is readable only by parents and
-- guardians of a tagged child, and by its author while they keep access.
DROP POLICY "journal_posts_rls" ON "journal_posts";
CREATE POLICY "journal_posts_rls" ON "journal_posts"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      "authorId" = current_setting('app.current_user_id', true)
      AND NOT EXISTS (SELECT 1 FROM "journal_post_children" WHERE "journalPostId" = "journal_posts"."id")
    )
    OR EXISTS (
      SELECT 1 FROM "journal_post_children" jpc
      JOIN "child_access" ca ON ca."childId" = jpc."childId"
      WHERE jpc."journalPostId" = "journal_posts"."id"
        AND ca."userId" = current_setting('app.current_user_id', true)
        AND (
          "journal_posts"."familyVisible"
          OR ca."role" IN ('PARENT', 'GUARDIAN')
          OR "journal_posts"."authorId" = current_setting('app.current_user_id', true)
        )
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      "authorId" = current_setting('app.current_user_id', true)
      AND NOT EXISTS (SELECT 1 FROM "journal_post_children" WHERE "journalPostId" = "journal_posts"."id")
    )
    OR EXISTS (
      SELECT 1 FROM "journal_post_children" jpc
      JOIN "child_access" ca ON ca."childId" = jpc."childId"
      WHERE jpc."journalPostId" = "journal_posts"."id"
        AND ca."userId" = current_setting('app.current_user_id', true)
    )
  );

-- Media file facts
ALTER TABLE "media_assets"
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "originalBytes" INTEGER,
  ADD COLUMN "derivedBytes" INTEGER,
  ADD COLUMN "playableBytes" INTEGER,
  ADD COLUMN "durationSeconds" DOUBLE PRECISION,
  ADD COLUMN "codec" TEXT;

-- Bookmarks (exactly one target)
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journalPostId" TEXT,
    "mediaAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bookmarks_one_target" CHECK (("journalPostId" IS NULL) <> ("mediaAssetId" IS NULL))
);
CREATE UNIQUE INDEX "bookmarks_userId_journalPostId_key" ON "bookmarks"("userId", "journalPostId");
CREATE UNIQUE INDEX "bookmarks_userId_mediaAssetId_key" ON "bookmarks"("userId", "mediaAssetId");
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_journalPostId_fkey" FOREIGN KEY ("journalPostId") REFERENCES "journal_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bookmarks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookmarks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bookmarks_rls" ON "bookmarks"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "userId" = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "userId" = current_setting('app.current_user_id', true)
  );

-- Emailed download links
CREATE TABLE "media_download_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "mediaIds" TEXT[],
    "variant" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_download_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "media_download_links_tokenHash_key" ON "media_download_links"("tokenHash");
CREATE INDEX "media_download_links_userId_idx" ON "media_download_links"("userId");
ALTER TABLE "media_download_links" ADD CONSTRAINT "media_download_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media_download_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_download_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY "media_download_links_rls" ON "media_download_links"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "userId" = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "userId" = current_setting('app.current_user_id', true)
  );
