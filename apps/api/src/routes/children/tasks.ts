import { Router, type Request } from "express";
import type { CreateTaskRequest, TaskDto, UpdateTaskRequest } from "@kinnd/shared";

import { ApiError } from "../../middleware/errorHandler";
import { can, requireCapability } from "../../lib/permissions";
import { withRls } from "../../lib/rls";
import { assertUsableCategories } from "../../lib/categories";
import { dateOnlyString, optionalDateOnly, optionalText, requiredText } from "../../lib/validation";

// Mounted at /children/:childId/tasks — "Reminders & Tasks". Creating and
// editing needs task:manage; ticking one done is open to every member.
export const tasksRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type TaskParams = { childId: string; id: string };

export function toTaskDto(row: {
  id: string;
  childId: string;
  title: string;
  note: string | null;
  categoryIds: string[];
  dueOn: Date | null;
  createdById: string | null;
  completedAt: Date | null;
  completedById: string | null;
  createdAt: Date;
}): TaskDto {
  return {
    id: row.id,
    childId: row.childId,
    title: row.title,
    note: row.note,
    categoryIds: row.categoryIds,
    dueOn: dateOnlyString(row.dueOn),
    createdByUserId: row.createdById,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedByUserId: row.completedById,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Open tasks, plus anything completed in the last 30 days. */
tasksRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await withRls(req.session.userId!, (tx) =>
      tx.task.findMany({
        where: { childId: req.params.childId, OR: [{ completedAt: null }, { completedAt: { gte: since } }] },
        orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      })
    );
    res.json({ tasks: rows.map(toTaskDto) });
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/", requireCapability("task:manage"), async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateTaskRequest>;
    const userId = req.session.userId!;
    const data = {
      childId: req.params.childId,
      title: requiredText(body.title, "title"),
      note: optionalText(body.note, "note") ?? null,
      categoryIds: await assertUsableCategories(userId, body.categoryIds),
      dueOn: optionalDateOnly(body.dueOn, "dueOn") ?? null,
      createdById: userId,
    };
    const row = await withRls(userId, (tx) => tx.task.create({ data }));
    res.status(201).json(toTaskDto(row));
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch("/:id", async (req: Request<TaskParams>, res, next) => {
  try {
    const body = req.body as Partial<UpdateTaskRequest>;
    const userId = req.session.userId!;
    const editsFields = ["title", "note", "categoryIds", "dueOn"].some((k) => k in body);
    if (editsFields && !can(req.childAccess!, "task:manage")) {
      throw new ApiError(403, "You don't have permission to edit tasks for this child");
    }
    if (body.completed !== undefined && typeof body.completed !== "boolean") {
      throw new ApiError(400, "completed must be true or false");
    }
    const data = {
      title: body.title === undefined ? undefined : requiredText(body.title, "title"),
      note: optionalText(body.note, "note"),
      categoryIds: await assertUsableCategories(userId, body.categoryIds, "partial"),
      dueOn: optionalDateOnly(body.dueOn, "dueOn"),
      ...(body.completed === undefined
        ? {}
        : body.completed
          ? { completedAt: new Date(), completedById: userId }
          : { completedAt: null, completedById: null }),
    };
    const row = await withRls(userId, async (tx) => {
      const existing = await tx.task.findFirst({ where: { id: req.params.id, childId: req.params.childId } });
      if (!existing) throw new ApiError(404, "Task not found");
      return tx.task.update({ where: { id: existing.id }, data });
    });
    res.json(toTaskDto(row));
  } catch (err) {
    next(err);
  }
});

tasksRouter.delete("/:id", requireCapability("task:manage"), async (req: Request<TaskParams>, res, next) => {
  try {
    await withRls(req.session.userId!, async (tx) => {
      const { count } = await tx.task.deleteMany({ where: { id: req.params.id, childId: req.params.childId } });
      if (count === 0) throw new ApiError(404, "Task not found");
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
