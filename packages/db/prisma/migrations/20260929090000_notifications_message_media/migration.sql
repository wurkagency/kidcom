-- v3.0 Phase 6: the in-app notification list, and message attachments that
-- every member of the conversation can open.

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "url" TEXT,
    "childId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A photo sent in a conversation: readable by the conversation's members.
-- A second permissive policy, OR'ed with media_assets_rls (read only; only
-- the uploader can change the asset).
CREATE POLICY "media_assets_message_read" ON "media_assets" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "messages" m
      JOIN "thread_members" tm ON tm."threadId" = m."threadId"
      WHERE m."mediaId" = "media_assets"."id"
        AND tm."userId" = current_setting('app.current_user_id', true)
    )
  );
