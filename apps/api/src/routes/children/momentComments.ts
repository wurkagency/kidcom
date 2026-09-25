import { Router, type Request } from "express";
import type { CommentDto, CreateCommentRequest, UpdateCommentRequest } from "@kinnd/shared";

import { ApiError } from "../../middleware/errorHandler";
import { withRls } from "../../lib/rls";

// Mounted at /children/:childId/moments/:postId/comments.
export const momentCommentsRouter = Router({ mergeParams: true });

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

momentCommentsRouter.get("/", async (req: Request<PostParams>, res, next) => {
  try {
    const rows = await withRls(req.session.userId!, async (tx) => {
      // The moment itself must be visible (it may be hidden from extended
      // family); the comments table's own policy only knows the children.
      const post = await tx.moment.findFirst({
        where: { id: req.params.postId, children: { some: { childId: req.params.childId } } },
        select: { id: true },
      });
      if (!post) throw new ApiError(404, "Post not found");
      return tx.comment.findMany({
        where: { momentId: post.id },
        include: { author: true },
        orderBy: { createdAt: "asc" },
      });
    });
    res.json({ items: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
});

momentCommentsRouter.post("/", async (req: Request<PostParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateCommentRequest>;
    if (!body.text?.trim()) {
      throw new ApiError(400, "text is required");
    }
    const text = body.text;
    const row = await withRls(req.session.userId!, async (tx) => {
      const post = await tx.moment.findFirst({
        where: { id: req.params.postId, children: { some: { childId: req.params.childId } } },
      });
      if (!post) throw new ApiError(404, "Post not found");

      return tx.comment.create({
        data: { momentId: post.id, authorId: req.session.userId!, text },
        include: { author: true },
      });
    });
    res.status(201).json(toDto(row));
  } catch (err) {
    next(err);
  }
});

momentCommentsRouter.patch("/:commentId", async (req: Request<CommentParams>, res, next) => {
  try {
    const body = req.body as Partial<UpdateCommentRequest>;
    if (!body.text?.trim()) {
      throw new ApiError(400, "text is required");
    }
    const row = await withRls(req.session.userId!, async (tx) => {
      const existing = await tx.comment.findFirst({
        where: { id: req.params.commentId, momentId: req.params.postId },
      });
      if (!existing) throw new ApiError(404, "Comment not found");
      if (existing.authorId !== req.session.userId) {
        throw new ApiError(403, "Only the author can edit this comment");
      }

      return tx.comment.update({
        where: { id: existing.id },
        data: { text: body.text },
        include: { author: true },
      });
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

momentCommentsRouter.delete("/:commentId", async (req: Request<CommentParams>, res, next) => {
  try {
    await withRls(req.session.userId!, async (tx) => {
      const existing = await tx.comment.findFirst({
        where: { id: req.params.commentId, momentId: req.params.postId },
      });
      if (!existing) throw new ApiError(404, "Comment not found");
      if (existing.authorId !== req.session.userId) {
        throw new ApiError(403, "Only the author can delete this comment");
      }
      await tx.comment.delete({ where: { id: existing.id } });
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
