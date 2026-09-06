import { Router, type NextFunction, type Request, type Response } from "express";
import type { CreateMessageRequest, CreateThreadRequest, MessageDto, ThreadDto, ThreadSummaryDto } from "@kidcom/shared";

import { prisma } from "../../db";
import { requireAuth } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import { pushQueue } from "../../lib/pushQueue";

// Top-level (not child-scoped) — Thread/Message have no childId. A caller
// may only message people they share at least one child's ChildAccess with
// (the "co-parent circle"), and may only read/post in threads they belong
// to (requireThreadMembership below).
export const messagesRouter = Router();

messagesRouter.use(requireAuth);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      threadMembership?: { threadId: string };
    }
  }
}

async function requireThreadMembership(req: Request, _res: Response, next: NextFunction) {
  try {
    const threadId = req.params.threadId;
    const membership = await prisma.threadMember.findUnique({
      where: { threadId_userId: { threadId, userId: req.session.userId! } },
    });
    if (!membership) {
      throw new ApiError(403, "You're not part of this conversation");
    }
    req.threadMembership = { threadId };
    next();
  } catch (err) {
    next(err);
  }
}

function toMessageDto(row: {
  id: string;
  threadId: string;
  senderId: string;
  sender: { firstName: string; lastName: string };
  text: string | null;
  mediaId: string | null;
  createdAt: Date;
}): MessageDto {
  return {
    id: row.id,
    threadId: row.threadId,
    senderId: row.senderId,
    senderName: `${row.sender.firstName} ${row.sender.lastName}`.trim(),
    text: row.text,
    mediaId: row.mediaId,
    createdAt: row.createdAt.toISOString(),
  };
}

// All threads the caller belongs to, with the other member(s), the latest
// message, and whether it's unread relative to the caller's lastReadAt.
messagesRouter.get("/threads", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const memberships = await prisma.threadMember.findMany({
      where: { userId },
      include: {
        thread: {
          include: {
            members: { include: { user: true } },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { sender: true },
            },
          },
        },
      },
    });

    const summaries: ThreadSummaryDto[] = memberships
      .map((m) => {
        const lastMessageRow = m.thread.messages[0] ?? null;
        return {
          id: m.thread.id,
          isGroup: m.thread.isGroup,
          members: m.thread.members
            .filter((tm) => tm.userId !== userId)
            .map((tm) => ({ userId: tm.userId, firstName: tm.user.firstName, lastName: tm.user.lastName })),
          lastMessage: lastMessageRow ? toMessageDto(lastMessageRow) : null,
          unread: lastMessageRow
            ? !m.lastReadAt || lastMessageRow.createdAt > m.lastReadAt
            : false,
          _sort: lastMessageRow?.createdAt ?? m.thread.createdAt,
        };
      })
      .sort((a, b) => b._sort.getTime() - a._sort.getTime())
      .map(({ _sort, ...rest }) => rest);

    res.json({ items: summaries });
  } catch (err) {
    next(err);
  }
});

// Creates a thread, or reuses an existing 1:1 thread between the same two
// users so "message this co-parent" is idempotent from the UI's point of
// view. Every target must share at least one child (ChildAccess) with the
// caller — this is the messaging boundary since there's no separate
// Household entity (same reasoning as the /children/family endpoint).
messagesRouter.post("/threads", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as Partial<CreateThreadRequest>;
    const targetIds = [...new Set((body.memberUserIds ?? []).filter((id) => id && id !== userId))];
    if (targetIds.length === 0) {
      throw new ApiError(400, "memberUserIds must include at least one other user");
    }

    const myChildIds = (
      await prisma.childAccess.findMany({ where: { userId }, select: { childId: true } })
    ).map((a) => a.childId);
    const sharedTargets = await prisma.childAccess.findMany({
      where: { userId: { in: targetIds }, childId: { in: myChildIds } },
      select: { userId: true },
    });
    const sharedUserIds = new Set(sharedTargets.map((a) => a.userId));
    const notShared = targetIds.filter((id) => !sharedUserIds.has(id));
    if (notShared.length > 0) {
      throw new ApiError(403, "You can only message people you share a child with");
    }

    const isGroup = targetIds.length > 1;
    const allMemberIds = [userId, ...targetIds];

    if (!isGroup) {
      const existing = await prisma.thread.findFirst({
        where: {
          isGroup: false,
          members: { every: { userId: { in: allMemberIds } } },
          AND: [
            { members: { some: { userId } } },
            { members: { some: { userId: targetIds[0] } } },
          ],
        },
        include: { members: true },
      });
      if (existing && existing.members.length === 2) {
        res.status(200).json({ id: existing.id });
        return;
      }
    }

    const thread = await prisma.$transaction(async (tx) => {
      const created = await tx.thread.create({ data: { isGroup } });
      await tx.threadMember.createMany({
        data: allMemberIds.map((id) => ({ threadId: created.id, userId: id })),
      });
      return created;
    });

    res.status(201).json({ id: thread.id });
  } catch (err) {
    next(err);
  }
});

// Thread metadata (id/isGroup/members) independent of message load order —
// used by the client to derive a stable header title, including for a
// brand-new thread that has no messages yet.
messagesRouter.get("/threads/:threadId", requireThreadMembership, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const thread = await prisma.thread.findUnique({
      where: { id: req.params.threadId },
      include: { members: { include: { user: true } } },
    });
    if (!thread) throw new ApiError(404, "Thread not found");

    const dto: ThreadDto = {
      id: thread.id,
      isGroup: thread.isGroup,
      members: thread.members
        .filter((tm) => tm.userId !== userId)
        .map((tm) => ({ userId: tm.userId, firstName: tm.user.firstName, lastName: tm.user.lastName })),
    };
    res.json(dto);
  } catch (err) {
    next(err);
  }
});

messagesRouter.get("/threads/:threadId/messages", requireThreadMembership, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const take = Math.min(Number(req.query.limit ?? 50), 100);

    const rows = await prisma.message.findMany({
      where: { threadId: req.params.threadId },
      include: { sender: true },
      orderBy: { createdAt: "asc" },
      take,
    });

    await prisma.threadMember.update({
      where: { threadId_userId: { threadId: req.params.threadId, userId } },
      data: { lastReadAt: new Date() },
    });

    res.json({ items: rows.map(toMessageDto) });
  } catch (err) {
    next(err);
  }
});

messagesRouter.post("/threads/:threadId/messages", requireThreadMembership, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as Partial<CreateMessageRequest>;
    if (!body.text?.trim() && !body.mediaId) {
      throw new ApiError(400, "text or mediaId is required");
    }
    if (body.mediaId) {
      const asset = await prisma.mediaAsset.findUnique({ where: { id: body.mediaId } });
      if (!asset || asset.ownerId !== userId) {
        throw new ApiError(403, "You don't own that media");
      }
    }

    const row = await prisma.message.create({
      data: {
        threadId: req.params.threadId,
        senderId: userId,
        text: body.text?.trim() || null,
        mediaId: body.mediaId ?? null,
      },
      include: { sender: true },
    });

    // The sender has, by definition, seen their own message.
    await prisma.threadMember.update({
      where: { threadId_userId: { threadId: req.params.threadId, userId } },
      data: { lastReadAt: new Date() },
    });

    // Push to every other thread member — best-effort, doesn't block the
    // response (chunk 8: see lib/pushQueue.ts).
    const otherMembers = await prisma.threadMember.findMany({
      where: { threadId: req.params.threadId, userId: { not: userId } },
      select: { userId: true },
    });
    await Promise.all(
      otherMembers.map((m) =>
        pushQueue.add("send-push", {
          userId: m.userId,
          title: row.sender.firstName,
          body: row.text ?? "Sent a photo",
          url: `/messages/${req.params.threadId}`,
        })
      )
    );

    res.status(201).json(toMessageDto(row));
  } catch (err) {
    next(err);
  }
});
