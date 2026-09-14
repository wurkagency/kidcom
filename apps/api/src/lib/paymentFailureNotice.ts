import { prisma } from "../db";
import { mailSender } from "./mailSender";
import { pushQueue } from "./pushQueue";
import { GRACE_PERIOD_DAYS } from "./entitlement";

// spec 9.12 — "in-app + email notice to every adult on the child" the
// moment a payment fails (webhook accepted:false), naming what will be
// limited and when. Best-effort: a notification failure must never affect
// the webhook's own 200 ack to QuickPay.
export async function notifyPaymentFailure(ownerId: string): Promise<void> {
  try {
    const ownedAccess = await prisma.childAccess.findMany({
      where: { userId: ownerId, role: { in: ["PARENT", "GUARDIAN"] } },
      select: { childId: true, child: { select: { firstName: true } } },
    });
    if (ownedAccess.length === 0) return;
    const childIds = ownedAccess.map((a) => a.childId);
    const childNameById = new Map(ownedAccess.map((a) => [a.childId, a.child.firstName]));

    const otherMembers = await prisma.childAccess.findMany({
      where: { childId: { in: childIds }, userId: { not: ownerId } },
      select: { userId: true, childId: true, user: { select: { email: true } } },
    });

    // Group affected child names per recipient — one notice per person, not
    // one per (child, person) pair, even if they share several children
    // with this owner.
    const childNamesByRecipient = new Map<string, { email: string; names: Set<string> }>();
    for (const m of otherMembers) {
      const entry = childNamesByRecipient.get(m.userId) ?? { email: m.user.email, names: new Set<string>() };
      entry.names.add(childNameById.get(m.childId) ?? "a child");
      childNamesByRecipient.set(m.userId, entry);
    }

    await Promise.all(
      Array.from(childNamesByRecipient.entries()).map(async ([userId, { email, names }]) => {
        const childList = Array.from(names).join(", ");
        const body = `A payment failed on ${childList}'s plan. There's a ${GRACE_PERIOD_DAYS}-day grace period before anything is limited — take over the subscription to keep it active.`;
        await Promise.all([
          pushQueue.add("send-push", { userId, title: "Payment failed", body, url: "/billing" }),
          mailSender.send({
            to: email,
            subject: `Payment failed for ${childList}'s KidCom plan`,
            text: `${body}\n\nYou can take over the subscription from the Billing page in the app.`,
          }),
        ]);
      })
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to send payment-failure notices for owner ${ownerId}:`, err);
  }
}
