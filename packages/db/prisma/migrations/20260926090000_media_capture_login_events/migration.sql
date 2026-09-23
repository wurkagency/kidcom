-- v3.0: capture metadata and upload origin on media (for abuse and fraud
-- checks in manage.kidcom.org — never shown in the app), a location-free
-- copy of originals for everyone but the uploader, and a login event log.

ALTER TABLE "media_assets"
  ADD COLUMN "capturedLatitude" DOUBLE PRECISION,
  ADD COLUMN "capturedLongitude" DOUBLE PRECISION,
  ADD COLUMN "capturedAltitude" DOUBLE PRECISION,
  ADD COLUMN "capturedAt" TIMESTAMP(3),
  ADD COLUMN "deviceMake" TEXT,
  ADD COLUMN "deviceModel" TEXT,
  ADD COLUMN "uploadIp" TEXT,
  ADD COLUMN "uploadUserAgent" TEXT,
  ADD COLUMN "sharedOriginalPath" TEXT,
  ADD COLUMN "sharedOriginalBytes" INTEGER;

CREATE TYPE "LoginMethod" AS ENUM ('PASSWORD', 'TWO_FACTOR', 'GOOGLE', 'MICROSOFT', 'SIGNUP', 'OAUTH_SIGNUP', 'PASSWORD_RESET', 'INVITE');
CREATE TYPE "LoginOutcome" AS ENUM ('SUCCESS', 'FAILED');

CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "method" "LoginMethod" NOT NULL,
    "outcome" "LoginOutcome" NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_events_userId_createdAt_idx" ON "login_events"("userId", "createdAt");
CREATE INDEX "login_events_ip_createdAt_idx" ON "login_events"("ip", "createdAt");
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Written by the API with the bypass flag; a user may read their own
-- (a future "recent sign-ins" list). Nobody else, ever.
ALTER TABLE "login_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "login_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "login_events_rls" ON "login_events"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "userId" = current_setting('app.current_user_id', true)
  )
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
