import { Router, type Request } from "express";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";

// Mounted at /children/:childId/journal/:postId/reactions. POST toggles the
// caller's "Love" reaction on the post — create if absent, delete if
// present — and returns the new state + count.
export const journalReactionsRouter = Router({ mergeParams: true });

type PostParams = { childId: string; postId: string };

journalReactionsRouter.post("/", async (req: Request<PostParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const post = await prisma.journalPost.findFirst({
      where: { id: req.params.postId, children: { some: { childId: req.params.childId } } },
    });
    if (!post) throw new ApiError(404, "Post not found");

    const existing = await prisma.journalReaction.findUnique({
      where: { journalPostId_userId: { journalPostId: post.id, userId } },
    });

    if (existing) {
      await prisma.journalReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.journalReaction.create({ data: { journalPostId: post.id, userId } });
    }

    const reactionCount = await prisma.journalReaction.count({ where: { journalPostId: post.id } });
    res.json({ reactedByMe: !existing, reactionCount });
  } catch (err) {
    next(err);
  }
});
