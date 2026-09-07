import { Router, type Request } from "express";
import type { CreateJournalPostRequest, JournalPostDto, MediaAssetDto } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
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
  text: string;
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
    text: post.text,
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

    const posts = await prisma.journalPost.findMany({
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
    });

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

journalRouter.post("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateJournalPostRequest>;
    if (!body.title || !body.text) {
      throw new ApiError(400, "title and text are required");
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

    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.journalPost.create({
        data: {
          authorId: userId,
          title: body.title!,
          text: body.text!,
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
    const post = await prisma.journalPost.findFirst({
      where: { id: req.params.postId, children: { some: { childId: req.params.childId } } },
    });
    if (!post) throw new ApiError(404, "Post not found");
    if (post.authorId !== req.session.userId) {
      throw new ApiError(403, "Only the author can delete this post");
    }
    await prisma.journalPost.delete({ where: { id: post.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
