import type { Prisma } from "@kidcom/db";
import type { NotificationKind } from "@kidcom/shared";

import { prisma } from "../db";
import { pushQueue } from "./pushQueue";

// One way to tell people something happened: a row in their in-app
// notification list (rendered in their language by the client from `kind`
// + `params`) and a push — the push only when they want that category and
// it isn't their quiet hours (Copenhagen wall clock).
//
// Messages have their own inbox, so a new message is pushed but not listed.

type Category = "calendar" | "moments" | "lists" | "messages" | "account";

const CATEGORY: Record<NotificationKind, Category> = {
  "moment.shared": "moments",
  "event.created": "calendar",
  "event.requested": "calendar",
  "event.decided": "calendar",
  "swap.requested": "calendar",
  "swap.decided": "calendar",
  "appointment.reminder": "calendar",
  "list.claimed": "lists",
  "message.received": "messages",
  "upgrade.requested": "account",
  "payment.failed": "account",
  "child.suspended": "account",
  "child.deletion_warning": "account",
  "trial.ending": "account",
  "access.removed": "account",
};

export type NotifyParams = Record<string, string | number | null>;

// Push text is English for now (the notification list itself is translated
// client-side); per-recipient language comes with the translated locales.
const PUSH_TEXT: Record<NotificationKind, (p: NotifyParams) => { title: string; body: string }> = {
  "moment.shared": (p) => ({ title: `${p.actor} shared a moment`, body: String(p.title ?? "") }),
  "event.created": (p) => ({ title: `${p.actor} added to the calendar`, body: String(p.title ?? "") }),
  "event.requested": (p) => ({ title: "Calendar event requested", body: `${p.actor} asks to add "${p.title}"` }),
  "event.decided": (p) => ({ title: `Request ${p.status === "APPROVED" ? "approved" : "declined"}`, body: String(p.title ?? "") }),
  "swap.requested": (p) => ({ title: "Swap request", body: `${p.actor} asks to swap ${p.date}` }),
  "swap.decided": (p) => ({ title: `Swap ${p.status === "APPROVED" ? "approved" : "declined"}`, body: String(p.date ?? "") }),
  "appointment.reminder": (p) => ({ title: "Upcoming appointment", body: String(p.title ?? "") }),
  "list.claimed": (p) => ({ title: `${p.actor} will get it`, body: String(p.title ?? "") }),
  "message.received": (p) => ({ title: String(p.actor ?? ""), body: String(p.text ?? "") }),
  "upgrade.requested": (p) => ({ title: "Upgrade requested", body: `${p.actor} asks you to upgrade to ${p.tier}` }),
  "payment.failed": (p) => ({ title: "Payment failed", body: String(p.children ?? "") }),
  "child.suspended": (p) => ({ title: `${p.child} is hidden until someone pays`, body: `Pay or take ${p.child} over before ${p.date}, or ${p.child}'s data is deleted.` }),
  "child.deletion_warning": (p) => ({ title: `${p.child}'s data will be deleted`, body: `On ${p.date}, unless someone pays or takes ${p.child} over.` }),
  "trial.ending": (p) => ({ title: "Your free trial ends soon", body: `It ends on ${p.date}. Add a card to keep your plan.` }),
  "access.removed": (p) => ({ title: `${p.person} no longer sees ${p.child}`, body: `${p.actor} removed them.` }),
};

type Notice = {
  kind: NotificationKind;
  params?: NotifyParams;
  url?: string | null;
  childId?: string | null;
  actorId?: string | null;
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Is `at` inside [from, to) on the Copenhagen clock? Handles windows over midnight (21:00–07:00). */
export function inQuietHours(from: string, to: string, at = new Date()): boolean {
  const now = toMinutes(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit", hour12: false }).format(at));
  const a = toMinutes(from);
  const b = toMinutes(to);
  return a <= b ? now >= a && now < b : now >= a || now < b;
}

type Prefs = {
  categoryCalendar: boolean;
  categoryMoments: boolean;
  categoryLists: boolean;
  categoryMessages: boolean;
  doNotDisturb: boolean;
  quietHoursFrom: string;
  quietHoursTo: string;
};

const DEFAULT_PREFS: Prefs = {
  categoryCalendar: true,
  categoryMoments: true,
  categoryLists: false,
  categoryMessages: true,
  doNotDisturb: true,
  quietHoursFrom: "21:00",
  quietHoursTo: "07:00",
};

export function wantsPush(prefs: Prefs, category: Category, at = new Date()): boolean {
  if (category === "account") return true; // billing problems always get through
  const on = { calendar: prefs.categoryCalendar, moments: prefs.categoryMoments, lists: prefs.categoryLists, messages: prefs.categoryMessages }[category];
  if (!on) return false;
  return !(prefs.doNotDisturb && inQuietHours(prefs.quietHoursFrom, prefs.quietHoursTo, at));
}

/** Records the notice for each recipient (never the actor) and pushes it where wanted. Best-effort: never throws. */
export async function notify(userIds: Iterable<string>, notice: Notice): Promise<void> {
  const recipients = [...new Set(userIds)].filter((id) => id && id !== notice.actorId);
  if (recipients.length === 0) return;
  const params = notice.params ?? {};
  const category = CATEGORY[notice.kind];
  try {
    if (notice.kind !== "message.received") {
      await prisma.notification.createMany({
        data: recipients.map((userId) => ({
          userId,
          kind: notice.kind,
          params: params as Prisma.InputJsonObject,
          url: notice.url ?? null,
          childId: notice.childId ?? null,
          actorId: notice.actorId ?? null,
        })),
      });
    }
    const prefs = await prisma.notificationPreferences.findMany({ where: { userId: { in: recipients } } });
    const byUser = new Map(prefs.map((p) => [p.userId, p]));
    const text = PUSH_TEXT[notice.kind](params);
    await Promise.all(
      recipients
        .filter((userId) => wantsPush(byUser.get(userId) ?? DEFAULT_PREFS, category))
        .map((userId) => pushQueue.add("send-push", { userId, ...text, ...(notice.url ? { url: notice.url } : {}) })),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`notify(${notice.kind}) failed:`, err);
  }
}
