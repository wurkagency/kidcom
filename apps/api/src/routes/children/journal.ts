import { Router, type Request } from "express";
import type { CreateJournalPostRequest, JournalMediaDto, JournalPostDto, MediaAssetDto } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { requireCapability } from "../../lib/permissions";
import { withRls } from "../../lib/rls";
import { journalCommentsRouter } from "./journalComments";
import { journalReactionsRouter } from "./journalReactions";

// Mounted at /children/:childId/journal.
export const journalRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type PostParams = { childId: string; postId: string };

journalRouter.use("/:postId/comments", journalCommentsRouter);
journalRouter.use("/:postId/reactions", journalReactionsRouter);

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
}): JournalPostDto {
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

journalRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const take = Math.min(Number(req.query.limit ?? 20), 50);
    const cursor = req.query.cursor as string | undefined;

    const posts = await withRls(userId, (tx) =>
      tx.journalPost.findMany({
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
// child's journal posts — backs the Media Gallery screen, which shows all
// photos/videos across posts rather than one post's media at a time.
// Registered before "/:postId" below so "media" is never captured as a
// post id.
journalRouter.get("/media", async (req: Request<ChildParams>, res, next) => {
  try {
    const assets = await withRls(req.session.userId!, (tx) =>
      tx.mediaAsset.findMany({
        where: {
          status: "READY",
          journalPost: { children: { some: { childId: req.params.childId } } },
        },
        include: { journalPost: { include: { children: { select: { childId: true } } } } },
        orderBy: { journalPost: { createdAt: "desc" } },
      })
    );
    const items: JournalMediaDto[] = assets
      .filter((a) => a.journalPost)
      .map((a) => ({
        ...toMediaDto(a),
        postId: a.journalPost!.id,
        postCreatedAt: a.journalPost!.createdAt.toISOString(),
        childIds: a.journalPost!.children.map((c) => c.childId),
      }));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// Single-post fetch — added because JournalPostPage previously had no way
// to load a post's own content except carrying it over as router-navigation
// state from the feed card's link. That broke on a page reload, a deep
// link, or (the reported bug) any link that forgot to pass that state, such
// as the dashboard's "Latest Journal Entry" card — the page would silently
// show only comments with no post above them, reading as if it had linked
// to the wrong place. Fetching for real here removes that whole class of
// bug instead of chasing down every call site that needs to remember to
// pass state.
journalRouter.get("/:postId", async (req: Request<PostParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const post = await withRls(userId, (tx) =>
      tx.journalPost.findFirst({
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

// spec 9.5: a Caregiver may comment (see journalComments.ts, ungated) but
// not post — everyone else with FAMILY/PARENT access may post.
journalRouter.post("/", requireCapability("journal:post"), async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateJournalPostRequest>;
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
      const created = await tx.journalPost.create({
        data: {
          authorId: userId,
          title: body.title!,
          text: body.text?.trim() || null,
        },
      });
      await tx.journalPostChild.createMany({
        data: childIds.map((childId) => ({ journalPostId: created.id, childId })),
      });
      if (body.mediaAssetIds?.length) {
        // Only attach assets this user owns — prevents attaching someone
        // else's in-flight upload by guessing an id.
        await tx.mediaAsset.updateMany({
          where: { id: { in: body.mediaAssetIds }, ownerId: userId, journalPostId: null },
          data: { journalPostId: created.id },
        });
      }
      return tx.journalPost.findUniqueOrThrow({
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

journalRouter.delete("/:postId", async (req: Request<PostParams>, res, next) => {
  try {
    await withRls(req.session.userId!, async (tx) => {
      const post = await tx.journalPost.findFirst({
        where: { id: req.params.postId, children: { some: { childId: req.params.childId } } },
      });
      if (!post) throw new ApiError(404, "Post not found");
      if (post.authorId !== req.session.userId) {
        throw new ApiError(403, "Only the author can delete this post");
      }
      await tx.journalPost.delete({ where: { id: post.id } });
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
