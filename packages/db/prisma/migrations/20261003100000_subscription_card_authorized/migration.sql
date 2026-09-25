-- The customer authorised a card with QuickPay (subscription model: a trial
-- starts without a card; the first charge waits for the trial to end).
ALTER TABLE "subscriptions" ADD COLUMN "cardAuthorizedAt" TIMESTAMP(3);
