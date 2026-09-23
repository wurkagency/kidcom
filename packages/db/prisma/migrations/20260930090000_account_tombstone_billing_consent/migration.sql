-- v3.0 Phase 7: deleted accounts become anonymous tombstones (the family's
-- shared history keeps "Former member" as its author); checkout records the
-- withdrawal-right consent and the latest charge's order id.

ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "subscriptions"
  ADD COLUMN "withdrawalConsentAt" TIMESTAMP(3),
  ADD COLUMN "lastChargeOrderId" TEXT;
CREATE INDEX "subscriptions_lastChargeOrderId_idx" ON "subscriptions"("lastChargeOrderId");
