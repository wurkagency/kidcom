-- v3.0 Phase 5: list items get a due date and a claim with a note ("I'll get
-- it" for necessities and wishlists alike); children get a cover photo.

ALTER TABLE "list_items"
  ADD COLUMN "dueOn" DATE,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "claimNote" TEXT;

-- Existing claims keep working; their time is unknown.
ALTER TABLE "media_assets" ADD COLUMN "coverForChildId" TEXT;
CREATE UNIQUE INDEX "media_assets_coverForChildId_key" ON "media_assets"("coverForChildId");
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_coverForChildId_fkey" FOREIGN KEY ("coverForChildId") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "children" ADD COLUMN "coverImageUrl" TEXT;

-- The cover photo is readable by everyone with access to the child, like the
-- child's avatar; the owner-only clause excludes it once attached.
DROP POLICY "media_assets_rls" ON "media_assets";
CREATE POLICY "media_assets_rls" ON "media_assets"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      "ownerId" = current_setting('app.current_user_id', true)
      AND "journalPostId" IS NULL
      AND "avatarForChildId" IS NULL
      AND "avatarForUserId" IS NULL
      AND "listItemImageForId" IS NULL
      AND "coverForChildId" IS NULL
    )
    OR (
      "journalPostId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "journal_post_children" jpc
        JOIN "child_access" ca ON ca."childId" = jpc."childId"
        WHERE jpc."journalPostId" = "media_assets"."journalPostId"
          AND ca."userId" = current_setting('app.current_user_id', true)
      )
    )
    OR (
      "avatarForUserId" IS NOT NULL
      AND (
        "avatarForUserId" = current_setting('app.current_user_id', true)
        OR EXISTS (
          SELECT 1 FROM "child_access" ca1
          JOIN "child_access" ca2 ON ca2."childId" = ca1."childId"
          WHERE ca1."userId" = current_setting('app.current_user_id', true)
            AND ca2."userId" = "media_assets"."avatarForUserId"
        )
      )
    )
    OR (
      "avatarForChildId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "media_assets"."avatarForChildId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
    )
    OR (
      "coverForChildId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "media_assets"."coverForChildId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
    )
    OR (
      "listItemImageForId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "list_items" li
        JOIN "child_access" ca ON ca."childId" = li."childId"
        WHERE li.id = "media_assets"."listItemImageForId"
          AND ca."userId" = current_setting('app.current_user_id', true)
      )
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      "ownerId" = current_setting('app.current_user_id', true)
      AND "journalPostId" IS NULL
      AND "avatarForChildId" IS NULL
      AND "avatarForUserId" IS NULL
      AND "listItemImageForId" IS NULL
      AND "coverForChildId" IS NULL
    )
    OR (
      "journalPostId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "journal_post_children" jpc
        JOIN "child_access" ca ON ca."childId" = jpc."childId"
        WHERE jpc."journalPostId" = "media_assets"."journalPostId"
          AND ca."userId" = current_setting('app.current_user_id', true)
      )
    )
    OR (
      "avatarForUserId" IS NOT NULL
      AND (
        "avatarForUserId" = current_setting('app.current_user_id', true)
        OR EXISTS (
          SELECT 1 FROM "child_access" ca1
          JOIN "child_access" ca2 ON ca2."childId" = ca1."childId"
          WHERE ca1."userId" = current_setting('app.current_user_id', true)
            AND ca2."userId" = "media_assets"."avatarForUserId"
        )
      )
    )
    OR (
      "avatarForChildId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "media_assets"."avatarForChildId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
    )
    OR (
      "coverForChildId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "media_assets"."coverForChildId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
    )
    OR (
      "listItemImageForId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "list_items" li
        JOIN "child_access" ca ON ca."childId" = li."childId"
        WHERE li.id = "media_assets"."listItemImageForId"
          AND ca."userId" = current_setting('app.current_user_id', true)
      )
    )
  );
