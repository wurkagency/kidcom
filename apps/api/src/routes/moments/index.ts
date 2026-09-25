import { Router } from "express";

import { requireAuth } from "../../middleware/session";
import { withRls } from "../../lib/rls";
import { prisma } from "../../db";
import { childTiers } from "../../lib/circles";
import { tierHasFeature } from "@kinnd/shared";
import { galleryInclude, galleryWhere, momentInclude, momentWhere, parseMomentFilters, toMomentDto, toMomentMediaDto } from "../../lib/moments";

// The Moments tab: one feed and one gallery across every child the user can
// see (RLS decides, including moments hidden from extended family), narrowed
// by ?childIds= (the header's child selector), ?categoryIds= and ?types=.
export const momentsFeedRouter = Router();

momentsFeedRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const take = Math.min(Math.max(Number(req.query.limit ?? 20) || 20, 1), 50);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const posts = await withRls(userId, (tx) =>
      tx.moment.findMany({
        where: momentWhere(parseMomentFilters(req.query)),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        include: momentInclude(userId),
      })
    );
    const hasMore = posts.length > take;
    const page = posts.slice(0, take);
    res.json({ items: page.map(toMomentDto), nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null });
  } catch (err) {
    next(err);
  }
});

momentsFeedRouter.get("/media", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    // Subscription model: the Media Library only shows children whose
    // Circle includes it (originals are kept either way, §1).
    const mine = await prisma.childAccess.findMany({ where: { userId }, select: { childId: true } });
    const tiers = await childTiers(mine.map((m) => m.childId));
    const allowed = mine.map((m) => m.childId).filter((id) => tierHasFeature(tiers.get(id) ?? "FREE", "mediaLibrary"));
    const filters = parseMomentFilters(req.query);
    const childIds = filters.childIds.length ? filters.childIds.filter((id) => allowed.includes(id)) : allowed;
    if (childIds.length === 0) {
      res.json({ items: [] });
      return;
    }
    const assets = await withRls(userId, (tx) =>
      tx.mediaAsset.findMany({
        where: galleryWhere({ ...filters, childIds }),
        include: galleryInclude(userId),
        orderBy: [{ moment: { createdAt: "desc" } }, { createdAt: "asc" }],
        take: 1000,
      })
    );
    res.json({ items: assets.filter((a) => a.moment).map(toMomentMediaDto) });
  } catch (err) {
    next(err);
  }
});
