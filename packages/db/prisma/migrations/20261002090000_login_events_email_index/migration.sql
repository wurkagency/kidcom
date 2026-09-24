-- Per-account sign-in limit: failed password attempts are counted by the
-- typed email over the last 15 minutes (routes/auth/index.ts).
CREATE INDEX "login_events_email_createdAt_idx" ON "login_events"("email", "createdAt");
