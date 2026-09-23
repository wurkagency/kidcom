import { Router, type Request } from "express";

import { ApiError } from "../../middleware/errorHandler";
import { withRls } from "../../lib/rls";

// Mounted at /children/:childId/moments/:postId/reactions. POST toggles the
// caller's "Love" reaction on the post — create if absent, delete if
// present — and returns the new state + count.
export const momentReactionsRouter = Router({ mergeParams: true });

type PostParams = { childId: string; postId: string };

momentReactionsRouter.post("/", async (req: Request<PostParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const { existing, reactionCount } = await withRls(userId, async (tx) => {
      const post = await tx.moment.findFirst({
        where: { id: req.params.postId, children: { some: { childId: req.params.childId } } },
      });
      if (!post) throw new ApiError(404, "Post not found");

      const existing = await tx.momentReaction.findUnique({
        where: { momentId_userId: { momentId: post.id, userId } },
      });

      if (existing) {
        await tx.momentReaction.delete({ where: { id: existing.id } });
      } else {
        await tx.momentReaction.create({ data: { momentId: post.id, userId } });
      }

      const reactionCount = await tx.momentReaction.count({ where: { momentId: post.id } });
      return { existing, reactionCount };
    });
    res.json({ reactedByMe: !existing, reactionCount });
  } catch (err) {
    next(err);
  }
});
