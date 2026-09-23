import { Router } from "express";
import type { SearchResponse } from "@kidcom/shared";

import { prisma } from "../../db";
import { requireAuth } from "../../middleware/session";
import { withRls } from "../../lib/rls";

// Top-level, not child-scoped — one query fans out across every child the
// caller has ChildAccess to. Real, RLS-scoped results (list_items and
// journal_posts/journal_post_children are both RLS-protected on
// child_access — see packages/db/prisma/migrations/
// 20260917113553_rls_full_rollout — so withRls already restricts these to
// rows the caller can see; children are filtered explicitly the same way
// GET /children already does, since Child itself isn't RLS-protected).
export const searchRouter = Router();

searchRouter.use(requireAuth);

const RESULT_LIMIT = 8;

searchRouter.get("/", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (q.length < 2) {
      res.json({ children: [], moments: [], listItems: [], events: [] } satisfies SearchResponse);
      return;
    }

    const [children, moments, listItems, events] = await Promise.all([
      prisma.child.findMany({
        where: {
          deletedAt: null,
          access: { some: { userId } },
          OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }],
        },
        take: RESULT_LIMIT,
        orderBy: { firstName: "asc" },
      }),
      withRls(userId, (tx) =>
        tx.moment.findMany({
          where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { text: { contains: q, mode: "insensitive" } }] },
          orderBy: { createdAt: "desc" },
          take: RESULT_LIMIT,
          include: { children: { select: { childId: true }, take: 1 } },
        })
      ),
      withRls(userId, (tx) =>
        tx.listItem.findMany({
          where: { title: { contains: q, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
          take: RESULT_LIMIT,
        })
      ),
      // Upcoming first, then the most recent past ones.
      withRls(userId, async (tx) => {
        const match = { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { location: { contains: q, mode: "insensitive" as const } }] };
        const now = new Date();
        const upcoming = await tx.calendarEvent.findMany({ where: { ...match, startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: RESULT_LIMIT });
        const past = upcoming.length < RESULT_LIMIT
          ? await tx.calendarEvent.findMany({ where: { ...match, startsAt: { lt: now } }, orderBy: { startsAt: "desc" }, take: RESULT_LIMIT - upcoming.length })
          : [];
        return [...upcoming, ...past];
      }),
    ]);

    res.json({
      children: children.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        profileImageUrl: c.profileImageUrl,
      })),
      moments: moments
        .filter((p) => p.children.length > 0)
        .map((p) => ({
          id: p.id,
          childId: p.children[0].childId,
          title: p.title,
          snippet: (p.text ?? "").slice(0, 120),
          createdAt: p.createdAt.toISOString(),
        })),
      listItems: listItems.map((i) => ({ id: i.id, childId: i.childId, title: i.title, type: i.type })),
      events: events.map((e) => ({ id: e.id, childId: e.childId, title: e.title, startsAt: e.startsAt.toISOString(), allDay: e.allDay })),
    } satisfies SearchResponse);
  } catch (err) {
    next(err);
  }
});
