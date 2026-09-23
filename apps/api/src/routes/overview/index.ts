import { Router } from "express";
import type { ChildOverview, CustodyNow, CustodyPattern, OverviewResponse } from "@kidcom/shared";
import { findNextHandover, resolveCustodyBlockProgress, resolveCustodyForDate } from "@kidcom/shared";

import { prisma } from "../../db";
import { requireAuth } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import { can } from "../../lib/permissions";
import { withRls } from "../../lib/rls";
import { toCalendarEventDto } from "../../lib/calendarEventDto";
import { copenhagenToday, requiredDateOnly, copenhagenMidnight } from "../../lib/validation";
import { loadChildRange } from "../children/calendar";
import { toCustodyPlanDto } from "../children/custodyPlan";
import { toSwapRequestDto } from "../children/swapRequests";
import { toTaskDto } from "../children/tasks";
import { toChildNoteDto } from "../children/notes";
import { toSchoolLessonDto } from "../children/schoolLessons";
import { packingDate, toPackingItemDto } from "../children/handoverPacking";

// GET /overview?from=YYYY-MM-DD&to=YYYY-MM-DD[&childIds=a,b]
// Everything the Today screen and the calendar views show, for every child
// the caller can see (or the requested subset), in one round trip. Each
// child's data is read under that child's RLS context, exactly like the
// per-child endpoints.
export const overviewRouter = Router();
overviewRouter.use(requireAuth);

const DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 62;

overviewRouter.get("/", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const from = requiredDateOnly(req.query.from, "from");
    const to = requiredDateOnly(req.query.to, "to");
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    if (end < start) throw new ApiError(400, "to must not be before from");
    if ((end.getTime() - start.getTime()) / DAY > MAX_RANGE_DAYS) {
      throw new ApiError(400, `The range can span at most ${MAX_RANGE_DAYS} days`);
    }
    const wanted = typeof req.query.childIds === "string" && req.query.childIds ? req.query.childIds.split(",") : null;

    const access = await prisma.childAccess.findMany({
      where: { userId, child: { deletedAt: null }, ...(wanted ? { childId: { in: wanted } } : {}) },
      orderBy: { createdAt: "asc" },
    });

    const today = copenhagenToday();
    // Notes and completed tasks by Copenhagen day (see copenhagenMidnight).
    const dayStart = copenhagenMidnight(from);
    const dayEnd = copenhagenMidnight(new Date(end.getTime() + DAY).toISOString().slice(0, 10));
    const children: ChildOverview[] = [];
    for (const a of access) {
      const childId = a.childId;
      const members = await prisma.childAccess.findMany({
        where: { childId },
        include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      });

      const data = await withRls(userId, async (tx) => {
        const { plan, events } = await loadChildRange(tx, childId, start, end);
        const [tasks, notes, lessons, swaps, packingRows, forDate] = await Promise.all([
          tx.task.findMany({
            where: { childId, OR: [{ completedAt: null }, { completedAt: { gte: dayStart, lt: dayEnd } }] },
            orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
          }),
          tx.childNote.findMany({
            where: { childId, createdAt: { gte: dayStart, lt: dayEnd } },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
          tx.schoolLesson.findMany({ where: { childId }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] }),
          tx.swapRequest.findMany({ where: { childId, status: "PENDING" }, orderBy: { date: "asc" } }),
          tx.handoverPackingItem.findMany({ where: { childId }, orderBy: { sortOrder: "asc" } }),
          packingDate(tx, childId),
        ]);
        return { plan, events, tasks, notes, lessons, swaps, packingRows, forDate };
      });

      const planLike = data.plan
        ? { startDate: data.plan.startDate, patternDays: data.plan.patternDays as CustodyPattern }
        : null;
      const byDate: Record<string, string | null> = {};
      if (planLike) {
        for (let d = start.getTime(); d <= end.getTime(); d += DAY) {
          const day = new Date(d).toISOString().slice(0, 10);
          byDate[day] = resolveCustodyForDate(planLike, `${day}T00:00:00Z`);
        }
      }
      let custodyToday: CustodyNow | null = null;
      if (planLike) {
        const progress = resolveCustodyBlockProgress(planLike, `${today}T00:00:00Z`);
        const next = findNextHandover(planLike, today);
        if (progress) {
          custodyToday = {
            holderUserId: progress.userId,
            dayOfBlock: progress.dayOfBlock,
            blockLengthDays: progress.blockLengthDays,
            nextHandover: next
              ? { date: next.date, time: data.plan!.handoverTime, location: data.plan!.handoverLocation, toUserId: next.toUserId }
              : null,
          };
        }
      }

      children.push({
        childId,
        members: members.map((m) => ({
          userId: m.userId,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          avatarUrl: m.user.avatarUrl,
          role: m.role,
          relationship: m.relationship,
          isMinorMember: m.isMinorMember,
          invitedByUserId: null, // the family screen has it; the calendar never needs it
        })),
        custody: { plan: data.plan ? toCustodyPlanDto(data.plan) : null, byDate, today: custodyToday },
        events: data.events.map(toCalendarEventDto),
        tasks: data.tasks.map(toTaskDto),
        notes: data.notes.map(toChildNoteDto),
        lessons: data.lessons.map(toSchoolLessonDto),
        pendingSwaps: data.swaps.map(toSwapRequestDto),
        packing: { forDate: data.forDate, items: data.packingRows.map((r) => toPackingItemDto(r, data.forDate)) },
        can: {
          manageEvents: can(a, "calendar_event:manage"),
          requestSwap: can(a, "swap_request:create"),
          approveSwap: can(a, "swap_request:approve"),
          editCustody: can(a, "custody_plan:edit"),
        },
      });
    }

    res.json({ from, to, today, children } satisfies OverviewResponse);
  } catch (err) {
    next(err);
  }
});
