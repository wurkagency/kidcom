import { prisma } from "../db";
import { ApiError } from "../middleware/errorHandler";

// spec 9.10 — "soft caps... enforced with a support-contact message rather
// than a hard 403 [paywall]." The request still has to stop somewhere (it's
// still a 403 status), but the message is a fair-use nudge pointing at a
// human, not an upsell — and unlike the FREE-tier 1-child cap
// (billingPricing.ts's childCapForTier), this applies at every tier and to
// every creation path, bootstrap included. This is what actually bounds the
// solo-bootstrap-child pattern flagged in bootstrapGuardian.test.ts's
// Scenario 3 case: a lone GUARDIAN's one child stays FREE-satisfied forever,
// so mass-creating many such children is caught here, not by entitlement.
export const MAX_CHILDREN_PER_OWNER = 10;
export const MAX_MEMBERS_PER_CHILD = 15;

const SUPPORT_CONTACT = "support@kidcom.app";

export async function assertUnderChildFairUseCap(ownerId: string): Promise<void> {
  const count = await prisma.childAccess.count({
    where: { userId: ownerId, role: { in: ["PARENT", "GUARDIAN"] } },
  });
  if (count >= MAX_CHILDREN_PER_OWNER) {
    throw new ApiError(
      403,
      `You've reached our fair-use limit of ${MAX_CHILDREN_PER_OWNER} children on one account. If you have a genuine reason to add more, contact ${SUPPORT_CONTACT} and we'll help.`
    );
  }
}

export async function assertUnderMemberFairUseCap(childId: string): Promise<void> {
  const count = await prisma.childAccess.count({ where: { childId } });
  if (count >= MAX_MEMBERS_PER_CHILD) {
    throw new ApiError(
      403,
      `This child has reached our fair-use limit of ${MAX_MEMBERS_PER_CHILD} members. If you have a genuine reason to add more, contact ${SUPPORT_CONTACT} and we'll help.`
    );
  }
}
