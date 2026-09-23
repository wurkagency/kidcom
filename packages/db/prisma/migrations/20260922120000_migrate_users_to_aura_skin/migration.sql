-- Single-theme consolidation (v3.0, 2026-09-22): Greenkeeper, Sky, and Quiet
-- Architecture are retired; Aura is the only skin. Every existing account's
-- stored skin preference is migrated to 'aura' so no one is left pointing at
-- a value the app (packages/shared's isSkinId) no longer recognizes.
UPDATE "users" SET "skinId" = 'aura' WHERE "skinId" IS DISTINCT FROM 'aura';
