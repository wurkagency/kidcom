import type { RelationshipType } from "@kidcom/shared";

import { prisma } from "../db";

// Phase 6a (spec §1.5/9.20). Called once per real access grant — see
// callers in routes/children/index.ts (direct creation, a bootstrap grant)
// and routes/invites/index.ts (invite-accept / accept-as-me). Best-effort:
// analytics must never be able to fail the request that earns it — the
// try/catch below swallows and logs internally, so it's always safe for a
// caller to `await` this (deterministic ordering, no dangling unhandled
// promise) without risking the request itself on an analytics-write hiccup.
//
// Deliberately takes no childId/userId/email — see the AccessGrantEvent
// model comment in schema.prisma for why, and for the aggregation-only /
// minimum-cohort-10 / no-gender-derivation rules any future query against
// this table must follow.
export async function logAccessGrant(params: {
  relationship: RelationshipType;
  inviterRelationship?: RelationshipType | null;
  timeToAcceptMs?: number | null;
}): Promise<void> {
  try {
    await prisma.accessGrantEvent.create({
      data: {
        relationship: params.relationship,
        inviterRelationship: params.inviterRelationship ?? null,
        timeToAcceptMs: params.timeToAcceptMs ?? null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to log access-grant analytics event:", err);
  }
}
