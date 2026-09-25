import { Router, type Request } from "express";
import type { CreateSchoolLessonRequest, SchoolLessonDto, UpdateSchoolLessonRequest } from "@kinnd/shared";

import { ApiError } from "../../middleware/errorHandler";
import { requireCapability } from "../../lib/permissions";
import { withRls } from "../../lib/rls";
import { isHHMM, optionalText, requiredText } from "../../lib/validation";

// Mounted at /children/:childId/school-lessons — the weekly timetable shown
// on Today and in the calendar's School view. Parents and guardians edit it.
export const schoolLessonsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type LessonParams = { childId: string; id: string };

export function toSchoolLessonDto(row: {
  id: string;
  childId: string;
  weekday: number;
  startTime: string;
  endTime: string | null;
  subject: string;
  room: string | null;
  note: string | null;
  bring: string | null;
}): SchoolLessonDto {
  return {
    id: row.id,
    childId: row.childId,
    weekday: row.weekday,
    startTime: row.startTime,
    endTime: row.endTime,
    subject: row.subject,
    room: row.room,
    note: row.note,
    bring: row.bring,
  };
}

function weekday(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 7) {
    throw new ApiError(400, "weekday must be 1 (Monday) to 7 (Sunday)");
  }
  return value as number;
}

function time(value: unknown, field: string): string {
  if (!isHHMM(value)) throw new ApiError(400, `${field} must be HH:mm`);
  return value;
}

function optionalTime(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  return time(value, field);
}

const ORDER = [{ weekday: "asc" as const }, { startTime: "asc" as const }];

schoolLessonsRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const rows = await withRls(req.session.userId!, (tx) =>
      tx.schoolLesson.findMany({ where: { childId: req.params.childId }, orderBy: ORDER })
    );
    res.json({ lessons: rows.map(toSchoolLessonDto) });
  } catch (err) {
    next(err);
  }
});

schoolLessonsRouter.post("/", requireCapability("school:manage"), async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateSchoolLessonRequest>;
    const data = {
      childId: req.params.childId,
      weekday: weekday(body.weekday),
      startTime: time(body.startTime, "startTime"),
      endTime: optionalTime(body.endTime, "endTime") ?? null,
      subject: requiredText(body.subject, "subject", 100),
      room: optionalText(body.room, "room", 100) ?? null,
      note: optionalText(body.note, "note", 500) ?? null,
      bring: optionalText(body.bring, "bring", 100) ?? null,
    };
    const row = await withRls(req.session.userId!, (tx) => tx.schoolLesson.create({ data }));
    res.status(201).json(toSchoolLessonDto(row));
  } catch (err) {
    next(err);
  }
});

schoolLessonsRouter.patch("/:id", requireCapability("school:manage"), async (req: Request<LessonParams>, res, next) => {
  try {
    const body = req.body as Partial<UpdateSchoolLessonRequest>;
    const data = {
      weekday: body.weekday === undefined ? undefined : weekday(body.weekday),
      startTime: body.startTime === undefined ? undefined : time(body.startTime, "startTime"),
      endTime: optionalTime(body.endTime, "endTime"),
      subject: body.subject === undefined ? undefined : requiredText(body.subject, "subject", 100),
      room: optionalText(body.room, "room", 100),
      note: optionalText(body.note, "note", 500),
      bring: optionalText(body.bring, "bring", 100),
    };
    const row = await withRls(req.session.userId!, async (tx) => {
      const existing = await tx.schoolLesson.findFirst({ where: { id: req.params.id, childId: req.params.childId } });
      if (!existing) throw new ApiError(404, "Lesson not found");
      return tx.schoolLesson.update({ where: { id: existing.id }, data });
    });
    res.json(toSchoolLessonDto(row));
  } catch (err) {
    next(err);
  }
});

schoolLessonsRouter.delete("/:id", requireCapability("school:manage"), async (req: Request<LessonParams>, res, next) => {
  try {
    await withRls(req.session.userId!, async (tx) => {
      const { count } = await tx.schoolLesson.deleteMany({ where: { id: req.params.id, childId: req.params.childId } });
      if (count === 0) throw new ApiError(404, "Lesson not found");
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
