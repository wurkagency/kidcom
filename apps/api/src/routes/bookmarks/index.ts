import { Router } from "express";
import type { BookmarksResponse, CreateBookmarkRequest } from "@kinnd/shared";

import { requireAuth } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import { withRls } from "../../lib/rls";
import { galleryInclude, momentInclude, toMomentDto, toMomentMediaDto } from "../../lib/moments";

// Profile menu → Bookmarks: saved moments and media. A bookmark is private
// to its user (RLS); a bookmarked item the user can no longer see (access
// removed, hidden from family) simply isn't listed — the RLS-filtered
// include comes back empty.
export const bookmarksRouter = Router();
bookmarksRouter.use(requireAuth);

bookmarksRouter.get("/", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const rows = await withRls(userId, (tx) =>
      tx.bookmark.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
          moment: { include: momentInclude(userId) },
          mediaAsset: { include: galleryInclude(userId) },
        },
      })
    );
    const body: BookmarksResponse = {
      moments: rows.flatMap((b) => (b.moment ? [toMomentDto(b.moment)] : [])),
      media: rows.flatMap((b) => (b.mediaAsset?.moment && b.mediaAsset.status === "READY" ? [toMomentMediaDto(b.mediaAsset)] : [])),
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

/** Idempotent: bookmarking twice is fine. */
bookmarksRouter.post("/", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as Partial<{ momentId: string; mediaAssetId: string }> & CreateBookmarkRequest;
    const momentId = typeof body.momentId === "string" ? body.momentId : undefined;
    const mediaAssetId = typeof body.mediaAssetId === "string" ? body.mediaAssetId : undefined;
    if (Boolean(momentId) === Boolean(mediaAssetId)) throw new ApiError(400, "Give either momentId or mediaAssetId");

    await withRls(userId, async (tx) => {
      // Visible to this user? (RLS on moments / media decides.)
      const visible = momentId
        ? await tx.moment.findUnique({ where: { id: momentId }, select: { id: true } })
        : await tx.mediaAsset.findFirst({ where: { id: mediaAssetId, momentId: { not: null } }, select: { id: true } });
      if (!visible) throw new ApiError(404, "Not found");
      const existing = await tx.bookmark.findFirst({ where: { userId, momentId: momentId ?? null, mediaAssetId: mediaAssetId ?? null } });
      if (!existing) await tx.bookmark.create({ data: { userId, momentId: momentId ?? null, mediaAssetId: mediaAssetId ?? null } });
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** DELETE /bookmarks?momentId=… or ?mediaAssetId=… */
bookmarksRouter.delete("/", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const momentId = typeof req.query.momentId === "string" ? req.query.momentId : undefined;
    const mediaAssetId = typeof req.query.mediaAssetId === "string" ? req.query.mediaAssetId : undefined;
    if (Boolean(momentId) === Boolean(mediaAssetId)) throw new ApiError(400, "Give either momentId or mediaAssetId");
    await withRls(userId, (tx) =>
      tx.bookmark.deleteMany({ where: { userId, ...(momentId ? { momentId } : { mediaAssetId }) } })
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
