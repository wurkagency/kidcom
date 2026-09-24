-- Security sweep 2026-09-24: a log of every SMS sent, so the toll-fraud guard
-- can cap texts per number and in total (rolling 24 h). Purged after 90 days.

CREATE TABLE "sms_sends" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT NOT NULL,
    "purpose" "PhoneCodePurpose" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_sends_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sms_sends_phone_createdAt_idx" ON "sms_sends"("phone", "createdAt");
CREATE INDEX "sms_sends_createdAt_idx" ON "sms_sends"("createdAt");
