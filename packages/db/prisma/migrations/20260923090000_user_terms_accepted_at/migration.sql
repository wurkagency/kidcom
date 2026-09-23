-- Real consent record for signup's required Terms & Privacy checkbox
-- (Aura's kidcom_sign_up mockup) — a timestamp, not just a UI-only gate.
ALTER TABLE "users" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
