-- v3.0: the country dates, numbers and the first day of the week follow,
-- separate from the UI language. NULL = follow the device.

ALTER TABLE "users" ADD COLUMN "region" TEXT;
