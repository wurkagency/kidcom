import { Router, type Request } from "express";
import type { CommentDto, CreateCommentRequest, UpdateCommentRequest } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";

// Mounted at /children/:childId/journal/:postId/comments.
export const journalCommentsRouter = Router({ mergeParams: true });

type PostParams = { childId: string; postId: string };
type CommentParams = { childId: string; postId: string; commentId: string };

function toDto(row: {
  id: string;
  authorId: string;
  author: { firstName: string; lastName: string; avatarUrl: string | null };
  text: string;
  createdAt: Date;
}): CommentDto {
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: `${row.author.firstName} ${row.author.lastName}`.trim(),
    authorAvatarUrl: row.author.avatarUrl,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

journalCommentsRouter.get("/", async (req: Request<PostParams>, res, next) => {
  try {
    const rows = await prisma.comment.findMany({
      where: { journalPostId: req.params.postId },
      include: { author: true },
      orderBy: { createdAt: "asc" },
    });
    res.json({ items: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
});

journalCommentsRouter.post("/", async (req: Request<PostParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateCommentRequest>;
    if (!body.text?.trim()) {
      throw new ApiError(400, "text is required");
    }
    const post = await prisma.journalPost.findFirst({
      where: { id: req.params.postId, children: { some: { childId: req.params.childId } } },
    });
    if (!post) throw new ApiError(404, "Post not found");

    const row = await prisma.comment.create({
      data: { journalPostId: post.id, authorId: req.session.userId!, text: body.text },
      include: { author: true },
    });
    res.status(201).json(toDto(row));
  } catch (err) {
    next(err);
  }
});

journalCommentsRouter.patch("/:commentId", async (req: Request<CommentParams>, res, next) => {
  try {
    const body = req.body as Partial<UpdateCommentRequest>;
    if (!body.text?.trim()) {
      throw new ApiError(400, "text is required");
    }
    const existing = await prisma.comment.findFirst({
      where: { id: req.params.commentId, journalPostId: req.params.postId },
    });
    if (!existing) throw new ApiError(404, "Comment not found");
    if (existing.authorId !== req.session.userId) {
      throw new ApiError(403, "Only the author can edit this comment");
    }

    const row = await prisma.comment.update({
      where: { id: existing.id },
      data: { text: body.text },
      include: { author: true },
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

journalCommentsRouter.delete("/:commentId", async (req: Request<CommentParams>, res, next) => {
  try {
    const existing = await prisma.comment.findFirst({
      where: { id: req.params.commentId, journalPostId: req.params.postId },
    });
    if (!existing) throw new ApiError(404, "Comment not found");
    if (existing.authorId !== req.session.userId) {
      throw new ApiError(403, "Only the author can delete this comment");
    }
    await prisma.comment.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
