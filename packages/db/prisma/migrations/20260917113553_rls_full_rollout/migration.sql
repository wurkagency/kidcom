-- v2.0 RLS full rollout (plan §3.2, Phase 5) — extends the Phase 4 pilot
-- (medical_info, journal_posts, journal_post_children) to every remaining
-- child-scoped table. Same current_user_id/bypass_rls mechanism as that
-- migration; see its header comment for the full rationale. FORCE ROW LEVEL
-- SECURITY on every table for the same reason: the connecting app role owns
-- these tables and would otherwise silently bypass its own policies.
--
-- Deliberately NOT included here (see apps/api/src/lib/claimMerge.ts's own
-- comment for the first two): child_schedule_occurrence IS included (unlike
-- claimMerge's migrate-on-merge list, which skips it for an unrelated
-- unique-constraint reason) since it's still real per-child data that
-- needs the same isolation as everything else. child_deletion_request and
-- upgrade_request are left unprotected — access_grant_event-style
-- operational/workflow rows, not user-authored content, and out of this
-- branch's stated table list.

-- ---------------------------------------------------------------------------
-- Direct-childId tables — identical shape to medical_info's Phase 4 policy,
-- no ordering/RETURNING subtlety (unlike journal_posts, none of these are
-- created before their own defining relationship exists).
-- ---------------------------------------------------------------------------
ALTER TABLE "growth_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "growth_entries_rls" ON "growth_entries"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "growth_entries"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "growth_entries"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );

ALTER TABLE "child_schedule_occurrences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "child_schedule_occurrences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "child_schedule_occurrences_rls" ON "child_schedule_occurrences"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "child_schedule_occurrences"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "child_schedule_occurrences"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );

ALTER TABLE "emergency_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_contacts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "emergency_contacts_rls" ON "emergency_contacts"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "emergency_contacts"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "emergency_contacts"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );

ALTER TABLE "custody_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custody_plans" FORCE ROW LEVEL SECURITY;
CREATE POLICY "custody_plans_rls" ON "custody_plans"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "custody_plans"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "custody_plans"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );

ALTER TABLE "calendar_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "calendar_events_rls" ON "calendar_events"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "calendar_events"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "calendar_events"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );

ALTER TABLE "swap_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "swap_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "swap_requests_rls" ON "swap_requests"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "swap_requests"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "swap_requests"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );

ALTER TABLE "calendar_event_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_event_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "calendar_event_requests_rls" ON "calendar_event_requests"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "calendar_event_requests"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "calendar_event_requests"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );

ALTER TABLE "list_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "list_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "list_items_rls" ON "list_items"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "list_items"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "list_items"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );

-- ---------------------------------------------------------------------------
-- Transitive via calendarEventId -> calendar_events.childId.
-- ---------------------------------------------------------------------------
ALTER TABLE "calendar_event_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_event_checklist_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "calendar_event_checklist_items_rls" ON "calendar_event_checklist_items"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "calendar_events" ce
      JOIN "child_access" ca ON ca."childId" = ce."childId"
      WHERE ce.id = "calendar_event_checklist_items"."calendarEventId"
        AND ca."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "calendar_events" ce
      JOIN "child_access" ca ON ca."childId" = ce."childId"
      WHERE ce.id = "calendar_event_checklist_items"."calendarEventId"
        AND ca."userId" = current_setting('app.current_user_id', true)
    )
  );

ALTER TABLE "calendar_event_confirmations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_event_confirmations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "calendar_event_confirmations_rls" ON "calendar_event_confirmations"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "calendar_events" ce
      JOIN "child_access" ca ON ca."childId" = ce."childId"
      WHERE ce.id = "calendar_event_confirmations"."calendarEventId"
        AND ca."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "calendar_events" ce
      JOIN "child_access" ca ON ca."childId" = ce."childId"
      WHERE ce.id = "calendar_event_confirmations"."calendarEventId"
        AND ca."userId" = current_setting('app.current_user_id', true)
    )
  );

-- ---------------------------------------------------------------------------
-- Transitive via journalPostId -> journal_post_children -> child_access
-- (two hops). No ordering/RETURNING issue: both only ever get created after
-- their journalPostId's own child-tagging already exists.
-- ---------------------------------------------------------------------------
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "comments_rls" ON "comments"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "journal_post_children" jpc
      JOIN "child_access" ca ON ca."childId" = jpc."childId"
      WHERE jpc."journalPostId" = "comments"."journalPostId"
        AND ca."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "journal_post_children" jpc
      JOIN "child_access" ca ON ca."childId" = jpc."childId"
      WHERE jpc."journalPostId" = "comments"."journalPostId"
        AND ca."userId" = current_setting('app.current_user_id', true)
    )
  );

ALTER TABLE "journal_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_reactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "journal_reactions_rls" ON "journal_reactions"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "journal_post_children" jpc
      JOIN "child_access" ca ON ca."childId" = jpc."childId"
      WHERE jpc."journalPostId" = "journal_reactions"."journalPostId"
        AND ca."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "journal_post_children" jpc
      JOIN "child_access" ca ON ca."childId" = jpc."childId"
      WHERE jpc."journalPostId" = "journal_reactions"."journalPostId"
        AND ca."userId" = current_setting('app.current_user_id', true)
    )
  );

-- ---------------------------------------------------------------------------
-- media_assets — four independent, mutually-exclusive-in-practice scoping
-- paths (a real row only ever has one of journalPostId/avatarForChildId/
-- avatarForUserId/listItemImageForId set, or none — freshly uploaded), each
-- mirroring the exact branch apps/api/src/routes/media/index.ts's own
-- app-layer check already uses for that same case — RLS re-implements the
-- same rule independently, it doesn't invent a new one. The first branch
-- (owner, nothing attached yet) is what makes a fresh POST /media/upload's
-- INSERT ... RETURNING succeed, the same RETURNING/USING interaction
-- documented on journal_posts' policy in the Phase 4 migration.
-- ---------------------------------------------------------------------------
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;

CREATE POLICY "media_assets_rls" ON "media_assets"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      "ownerId" = current_setting('app.current_user_id', true)
      AND "journalPostId" IS NULL
      AND "avatarForChildId" IS NULL
      AND "avatarForUserId" IS NULL
      AND "listItemImageForId" IS NULL
    )
    OR (
      "journalPostId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "journal_post_children" jpc
        JOIN "child_access" ca ON ca."childId" = jpc."childId"
        WHERE jpc."journalPostId" = "media_assets"."journalPostId"
          AND ca."userId" = current_setting('app.current_user_id', true)
      )
    )
    OR (
      "avatarForUserId" IS NOT NULL
      AND (
        "avatarForUserId" = current_setting('app.current_user_id', true)
        OR EXISTS (
          SELECT 1 FROM "child_access" ca1
          JOIN "child_access" ca2 ON ca2."childId" = ca1."childId"
          WHERE ca1."userId" = current_setting('app.current_user_id', true)
            AND ca2."userId" = "media_assets"."avatarForUserId"
        )
      )
    )
    OR (
      "avatarForChildId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "media_assets"."avatarForChildId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
    )
    OR (
      "listItemImageForId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "list_items" li
        JOIN "child_access" ca ON ca."childId" = li."childId"
        WHERE li.id = "media_assets"."listItemImageForId"
          AND ca."userId" = current_setting('app.current_user_id', true)
      )
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      "ownerId" = current_setting('app.current_user_id', true)
      AND "journalPostId" IS NULL
      AND "avatarForChildId" IS NULL
      AND "avatarForUserId" IS NULL
      AND "listItemImageForId" IS NULL
    )
    OR (
      "journalPostId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "journal_post_children" jpc
        JOIN "child_access" ca ON ca."childId" = jpc."childId"
        WHERE jpc."journalPostId" = "media_assets"."journalPostId"
          AND ca."userId" = current_setting('app.current_user_id', true)
      )
    )
    OR (
      "avatarForUserId" IS NOT NULL
      AND (
        "avatarForUserId" = current_setting('app.current_user_id', true)
        OR EXISTS (
          SELECT 1 FROM "child_access" ca1
          JOIN "child_access" ca2 ON ca2."childId" = ca1."childId"
          WHERE ca1."userId" = current_setting('app.current_user_id', true)
            AND ca2."userId" = "media_assets"."avatarForUserId"
        )
      )
    )
    OR (
      "avatarForChildId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "media_assets"."avatarForChildId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
    )
    OR (
      "listItemImageForId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "list_items" li
        JOIN "child_access" ca ON ca."childId" = li."childId"
        WHERE li.id = "media_assets"."listItemImageForId"
          AND ca."userId" = current_setting('app.current_user_id', true)
      )
    )
  );
