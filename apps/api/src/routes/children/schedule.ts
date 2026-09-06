import { Router, type Request } from "express";
import type { ChildScheduleResponse } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";

// Mounted at /children/:childId/schedule — combines the child's country's
// MedicalScheduleTemplate rows with this child's ChildScheduleCompletion
// rows to drive the vaccination/checkup progress bar.
export const scheduleRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type CompleteParams = { childId: string; templateId: string };

scheduleRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const child = await prisma.child.findUniqueOrThrow({ where: { id: req.params.childId } });
    const [templates, completions] = await Promise.all([
      prisma.medicalScheduleTemplate.findMany({
        where: { countryCode: child.countryCode },
        orderBy: { ageInMonths: "asc" },
      }),
      prisma.childScheduleCompletion.findMany({ where: { childId: child.id } }),
    ]);

    const completedByTemplate = new Map(completions.map((c) => [c.templateId, c.completedAt]));

    const items = templates.map((t) => ({
      templateId: t.id,
      label: t.label,
      ageInMonths: t.ageInMonths,
      category: t.category,
      description: t.description,
      completed: completedByTemplate.has(t.id),
      completedAt: completedByTemplate.get(t.id)?.toISOString() ?? null,
    }));

    const response: ChildScheduleResponse = {
      items,
      completedCount: items.filter((i) => i.completed).length,
      totalCount: items.length,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

scheduleRouter.post("/:templateId/complete", async (req: Request<CompleteParams>, res, next) => {
  try {
    const template = await prisma.medicalScheduleTemplate.findUnique({
      where: { id: req.params.templateId },
    });
    if (!template) throw new ApiError(404, "Schedule template not found");

    await prisma.childScheduleCompletion.upsert({
      where: {
        childId_templateId: { childId: req.params.childId, templateId: req.params.templateId },
      },
      create: { childId: req.params.childId, templateId: req.params.templateId },
      update: {},
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
