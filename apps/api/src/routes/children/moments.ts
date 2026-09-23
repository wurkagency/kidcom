import { Router, type Request } from "express";
import type { CreateMomentRequest, UpdateMomentRequest } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { requireCapability } from "../../lib/permissions";
import { withRls, withRlsBypass } from "../../lib/rls";
import { assertUsableCategory } from "../../lib/categories";
import { galleryInclude, galleryWhere, momentInclude, momentWhere, parseMomentFilters, toMomentDto, toMomentMediaDto } from "../../lib/moments";
import { copenhagenToday, optionalDateOnly, optionalText, requiredText } from "../../lib/validation";
import { momentCommentsRouter } from "./momentComments";
import { momentReactionsRouter } from "./momentReactions";
import { notify } from "../../lib/notify";

// Mounted at /children/:childId/moments. The cross-child feed and gallery
// the Moments tab uses live in routes/moments; these stay for a single
// child (child profile) and for posting, editing and deleting.
export const momentsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type PostParams = { childId: string; postId: string };

momentsRouter.use("/:postId/comments", momentCommentsRouter);
momentsRouter.use("/:postId/reactions", momentReactionsRouter);

momentsRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const take = Math.min(Number(req.query.limit ?? 20), 50);
    const cursor = req.query.cursor as string | undefined;
    const filters = { ...parseMomentFilters(req.query), childIds: [req.params.childId] };

    const posts = await withRls(userId, (tx) =>
      tx.moment.findMany({
        where: momentWhere(filters),
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

// Every READY asset on this child's moments (child profile gallery).
// Registered before "/:postId" so "media" is never read as a post id.
momentsRouter.get("/media", async (req: Request<ChildParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const filters = { ...parseMomentFilters(req.query), childIds: [req.params.childId] };
    const assets = await withRls(userId, (tx) =>
      tx.mediaAsset.findMany({
        where: galleryWhere(filters),
        include: galleryInclude(userId),
        orderBy: [{ moment: { createdAt: "desc" } }, { createdAt: "asc" }],
      })
    );
    res.json({ items: assets.filter((a) => a.moment).map(toMomentMediaDto) });
  } catch (err) {
    next(err);
  }
});

momentsRouter.get("/:postId", async (req: Request<PostParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const post = await withRls(userId, (tx) =>
      tx.moment.findFirst({
        where: { id: req.params.postId, children: { some: { childId: req.params.childId } } },
        include: momentInclude(userId),
      })
    );
    if (!post) throw new ApiError(404, "Post not found");
    res.json(toMomentDto(post));
  } catch (err) {
    next(err);
  }
});

/** The rest of the family (who can see it) gets a friendly push. */
async function notifyFamily(momentId: string, authorId: string, childIds: string[], familyVisible: boolean) {
  const [author, members] = await withRlsBypass((tx) =>
    Promise.all([
      tx.user.findUnique({ where: { id: authorId }, select: { firstName: true } }),
      tx.childAccess.findMany({
        where: {
          childId: { in: childIds },
          userId: { not: authorId },
          ...(familyVisible ? {} : { role: { in: ["PARENT", "GUARDIAN"] } }),
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ])
  );
  const moment = await withRlsBypass((tx) => tx.moment.findUnique({ where: { id: momentId }, select: { title: true } }));
  await notify(
    members.map((m) => m.userId),
    {
      kind: "moment.shared",
      params: { actor: author?.firstName ?? null, title: moment?.title ?? "" },
      url: `/children/${childIds[0]}/moments/${momentId}`,
      childId: childIds[0],
      actorId: authorId,
    }
  );
}

// spec 9.5: everyone with PARENT/GUARDIAN/FAMILY access may post.
momentsRouter.post("/", requireCapability("moments:post"), async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateMomentRequest>;
    const userId = req.session.userId!;
    const title = requiredText(body.title, "title", 200);
    const text = optionalText(body.text, "text", 5000) ?? null;
    const location = optionalText(body.location, "location", 200) ?? null;
    const occurredOn = optionalDateOnly(body.occurredOn, "occurredOn") ?? new Date(`${copenhagenToday()}T00:00:00Z`);
    const categoryId = await assertUsableCategory(userId, body.categoryId);
    const familyVisible = body.familyVisible !== false;
    const childIds = body.childIds?.length ? [...new Set(body.childIds)] : [req.params.childId];

    // req.childAccess only proves access to the URL's child — every tagged
    // child must be accessible too.
    const accessCount = await prisma.childAccess.count({ where: { userId, childId: { in: childIds } } });
    if (accessCount !== childIds.length) throw new ApiError(403, "No access to one or more tagged children");

    const post = await withRls(userId, async (tx) => {
      const created = await tx.moment.create({
        data: { authorId: userId, title, text, location, occurredOn, categoryId, familyVisible },
      });
      await tx.momentChild.createMany({ data: childIds.map((childId) => ({ momentId: created.id, childId })) });
      if (body.mediaAssetIds?.length) {
        // Only this user's own, unattached uploads.
        await tx.mediaAsset.updateMany({
          where: { id: { in: body.mediaAssetIds }, ownerId: userId, momentId: null },
          data: { momentId: created.id },
        });
      }
      return tx.moment.findUniqueOrThrow({ where: { id: created.id }, include: momentInclude(userId) });
    });

    if (body.notify) {
      notifyFamily(post.id, userId, childIds, familyVisible).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("Moment notification failed:", err);
      });
    }
    res.status(201).json(toMomentDto(post));
  } catch (err) {
    next(err);
  }
});

// Author-only edit of the words and settings (media stays as posted).
momentsRouter.patch("/:postId", async (req: Request<PostParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as UpdateMomentRequest;
    const data = {
      ...(body.title !== undefined ? { title: requiredText(body.title, "title", 200) } : {}),
      ...(body.text !== undefined ? { text: optionalText(body.text, "text", 5000) ?? null } : {}),
      ...(body.location !== undefined ? { location: optionalText(body.location, "location", 200) ?? null } : {}),
      ...(body.occurredOn !== undefined ? { occurredOn: optionalDateOnly(body.occurredOn, "occurredOn") ?? null } : {}),
      ...(body.categoryId !== undefined ? { categoryId: await assertUsableCategory(userId, body.categoryId) } : {}),
      ...(body.familyVisible !== undefined ? { familyVisible: Boolean(body.familyVisible) } : {}),
    };
    const post = await withRls(userId, async (tx) => {
      const existing = await tx.moment.findFirst({
        where: { id: req.params.postId, children: { some: { childId: req.params.childId } } },
      });
      if (!existing) throw new ApiError(404, "Post not found");
      if (existing.authorId !== userId) throw new ApiError(403, "Only the author can edit this post");
      await tx.moment.update({ where: { id: existing.id }, data });
      return tx.moment.findUniqueOrThrow({ where: { id: existing.id }, include: momentInclude(userId) });
    });
    res.json(toMomentDto(post));
  } catch (err) {
    next(err);
  }
});

momentsRouter.delete("/:postId", async (req: Request<PostParams>, res, next) => {
  try {
    await withRls(req.session.userId!, async (tx) => {
      const post = await tx.moment.findFirst({
        where: { id: req.params.postId, children: { some: { childId: req.params.childId } } },
      });
      if (!post) throw new ApiError(404, "Post not found");
      if (post.authorId !== req.session.userId) throw new ApiError(403, "Only the author can delete this post");
      await tx.moment.delete({ where: { id: post.id } });
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
