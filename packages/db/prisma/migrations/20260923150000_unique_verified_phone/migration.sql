-- A verified mobile number identifies one account (it is how a forgotten
-- password is recovered by SMS). Unverified/pending numbers are unrestricted.
CREATE UNIQUE INDEX "users_verified_phone_key" ON "users"("phone") WHERE "phoneVerifiedAt" IS NOT NULL;
