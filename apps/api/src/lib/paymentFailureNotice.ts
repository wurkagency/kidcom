import { prisma } from "../db";
import { config } from "../config";
import { mailSender } from "./mailSender";
import { notify } from "./notify";

// D5: "declined is declined". The owner hears about it straight away, with
// an "update card" link; the other parents get their take-over offer from
// the suspension notices (circleLifecycle.ts) when the children are hidden.
// Best-effort: a notification failure must never affect the webhook's 200
// ack to QuickPay or the renewal job.
export async function notifyPaymentFailure(ownerId: string): Promise<void> {
  try {
    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true, deletedAt: true } });
    if (!owner || owner.deletedAt) return;
    await notify([ownerId], { kind: "payment.failed", params: { children: "" }, url: "/billing" });
    await mailSender.send({
      to: owner.email,
      subject: "Your Kinnd payment failed",
      text:
        "We couldn't charge your card for your Kinnd plan, so the plan has stopped.\n\n" +
        "Update your card to switch it back on. Children the free plan can't hold are hidden until someone pays or " +
        `takes them over, and deleted after 90 days: ${config.webBaseUrl}/billing`,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`notifyPaymentFailure(${ownerId}) failed:`, err);
  }
}
