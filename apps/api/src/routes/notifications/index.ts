import { Router } from "express";
import { NOTIFICATION_KINDS, type NotificationDto, type NotificationKind, type NotificationsResponse } from "@kinnd/shared";

import { prisma } from "../../db";
import { requireAuth } from "../../middleware/session";

// The caller's own notification list (written by lib/notify.ts). Rows are
// informational: the client shows them, newest first, and marks them read
// when the list is opened.
export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

const PAGE = 30;
const isKind = (k: string): k is NotificationKind => (NOTIFICATION_KINDS as readonly string[]).includes(k);

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PAGE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const page = rows.slice(0, PAGE).filter((r) => isKind(r.kind));
    const actorIds = [...new Set(page.map((r) => r.actorId).filter((id): id is string => !!id))];
    const actors = new Map(
      (await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, avatarUrl: true } })).map((u) => [u.id, u.avatarUrl]),
    );
    const items: NotificationDto[] = page.map((r) => ({
      id: r.id,
      kind: r.kind as NotificationKind,
      params: (r.params ?? {}) as NotificationDto["params"],
      url: r.url,
      childId: r.childId,
      actorId: r.actorId,
      actorAvatarUrl: r.actorId ? actors.get(r.actorId) ?? null : null,
      createdAt: r.createdAt.toISOString(),
      read: r.readAt !== null,
    }));
    res.json({ items, unreadCount, nextCursor: rows.length > PAGE ? rows[PAGE - 1]!.id : null } satisfies NotificationsResponse);
  } catch (err) {
    next(err);
  }
});

/** Marks everything read (the list was opened). */
notificationsRouter.post("/read", async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.session.userId!, readAt: null }, data: { readAt: new Date() } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
