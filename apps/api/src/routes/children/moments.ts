import { Router, type Request } from "express";
import type { CreateMomentRequest, MomentMediaDto, MomentDto, MediaAssetDto } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { requireCapability } from "../../lib/permissions";
import { withRls } from "../../lib/rls";
import { momentCommentsRouter } from "./momentComments";
import { momentReactionsRouter } from "./momentReactions";

// Mounted at /children/:childId/moments.
export const momentsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type PostParams = { childId: string; postId: string };

momentsRouter.use("/:postId/comments", momentCommentsRouter);
momentsRouter.use("/:postId/reactions", momentReactionsRouter);

function toMediaDto(m: {
  id: string;
  type: "IMAGE" | "VIDEO";
  status: "PROCESSING" | "READY" | "FAILED";
  width: number | null;
  height: number | null;
}): MediaAssetDto {
  return { id: m.id, type: m.type, status: m.status, width: m.width, height: m.height };
}

function toPostDto(post: {
  id: string;
  children: { childId: string }[];
  authorId: string;
  author: { firstName: string; lastName: string; avatarUrl: string | null };
  title: string;
  text: string | null;
  createdAt: Date;
  media: Parameters<typeof toMediaDto>[0][];
  _count: { comments: number; reactions: number };
  reactions: { userId: string }[];
  currentUserId: string;
}): MomentDto {
  return {
    id: post.id,
    childIds: post.children.map((c) => c.childId),
    authorId: post.authorId,
    authorName: `${post.author.firstName} ${post.author.lastName}`.trim(),
    authorAvatarUrl: post.author.avatarUrl,
    title: post.title,
    // DTO keeps text as a plain string (never null) so every existing
    // frontend read site keeps working unchanged — description is optional
    // to the user, but "" is simpler for callers than string | null.
    text: post.text ?? "",
    createdAt: post.createdAt.toISOString(),
    media: post.media.map(toMediaDto),
    commentCount: post._count.comments,
    reactionCount: post._count.reactions,
    reactedByMe: post.reactions.some((r) => r.userId === post.currentUserId),
  };
}

momentsRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const take = Math.min(Number(req.query.limit ?? 20), 50);
    const cursor = req.query.cursor as string | undefined;

    const posts = await withRls(userId, (tx) =>
      tx.moment.findMany({
        where: { children: { some: { childId: req.params.childId } } },
        orderBy: { createdAt: "desc" },
        take: take + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        include: {
          author: true,
          media: true,
          children: { select: { childId: true } },
          _count: { select: { comments: true, reactions: true } },
          reactions: { where: { userId }, select: { userId: true } },
        },
      })
    );

    const hasMore = posts.length > take;
    const page = posts.slice(0, take);

    res.json({
      items: page.map((p) => toPostDto({ ...p, currentUserId: userId })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  } catch (err) {
    next(err);
  }
});

// Flat, month-groupable list of every READY media asset attached to this
// child's moments — backs the Media Gallery screen, which shows all
// photos/videos across posts rather than one post's media at a time.
// Registered before "/:postId" below so "media" is never captured as a
// post id.
momentsRouter.get("/media", async (req: Request<ChildParams>, res, next) => {
  try {
    const assets = await withRls(req.session.userId!, (tx) =>
      tx.mediaAsset.findMany({
        where: {
          status: "READY",
          moment: { children: { some: { childId: req.params.childId } } },
        },
        include: { moment: { include: { children: { select: { childId: true } } } } },
        orderBy: { moment: { createdAt: "desc" } },
      })
    );
    const items: MomentMediaDto[] = assets
      .filter((a) => a.moment)
      .map((a) => ({
        ...toMediaDto(a),
        postId: a.moment!.id,
        postCreatedAt: a.moment!.createdAt.toISOString(),
        childIds: a.moment!.children.map((c) => c.childId),
      }));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// Single-post fetch — added because MomentPage previously had no way
// to load a post's own content except carrying it over as router-navigation
// state from the feed card's link. That broke on a page reload, a deep
// link, or (the reported bug) any link that forgot to pass that state, such
// as the dashboard's "Latest Moment" card — the page would silently
// show only comments with no post above them, reading as if it had linked
// to the wrong place. Fetching for real here removes that whole class of
// bug instead of chasing down every call site that needs to remember to
// pass state.
momentsRouter.get("/:postId", async (req: Request<PostParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const post = await withRls(userId, (tx) =>
      tx.moment.findFirst({
        where: { id: req.params.postId, children: { some: { childId: req.params.childId } } },
        include: {
          author: true,
          media: true,
          children: { select: { childId: true } },
          _count: { select: { comments: true, reactions: true } },
          reactions: { where: { userId }, select: { userId: true } },
        },
      })
    );
    if (!post) throw new ApiError(404, "Post not found");
    res.json(toPostDto({ ...post, currentUserId: userId }));
  } catch (err) {
    next(err);
  }
});

// spec 9.5: a Caregiver may comment (see momentComments.ts, ungated) but
// not post — everyone else with FAMILY/PARENT access may post.
momentsRouter.post("/", requireCapability("moments:post"), async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateMomentRequest>;
    if (!body.title) {
      throw new ApiError(400, "title is required");
    }
    const userId = req.session.userId!;

    const childIds = body.childIds?.length ? body.childIds : [req.params.childId];

    // req.childAccess only proves access to the URL's childId — verify the
    // user also has access to every OTHER tagged child before creating.
    const accessCount = await prisma.childAccess.count({
      where: { userId, childId: { in: childIds } },
    });
    if (accessCount !== childIds.length) {
      throw new ApiError(403, "No access to one or more tagged children");
    }

    const post = await withRls(userId, async (tx) => {
      const created = await tx.moment.create({
        data: {
          authorId: userId,
          title: body.title!,
          text: body.text?.trim() || null,
        },
      });
      await tx.momentChild.createMany({
        data: childIds.map((childId) => ({ momentId: created.id, childId })),
      });
      if (body.mediaAssetIds?.length) {
        // Only attach assets this user owns — prevents attaching someone
        // else's in-flight upload by guessing an id.
        await tx.mediaAsset.updateMany({
          where: { id: { in: body.mediaAssetIds }, ownerId: userId, momentId: null },
          data: { momentId: created.id },
        });
      }
      return tx.moment.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          author: true,
          media: true,
          children: { select: { childId: true } },
          _count: { select: { comments: true, reactions: true } },
          reactions: { where: { userId }, select: { userId: true } },
        },
      });
    });

    res.status(201).json(toPostDto({ ...post, currentUserId: userId }));
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
      if (post.authorId !== req.session.userId) {
        throw new ApiError(403, "Only the author can delete this post");
      }
      await tx.moment.delete({ where: { id: post.id } });
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
