import { Router, type Request } from "express";
import type { ChildScheduleResponse, ScheduleItem, UpdateScheduleOccurrenceRequest } from "@kidcom/shared";

import type { Prisma } from "@kidcom/db";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { withRls } from "../../lib/rls";

// Mounted at /children/:childId/schedule — combines the child's country's
// MedicalScheduleTemplate rows with this child's ChildScheduleOccurrence
// rows to drive the "Medical Progress" checkup/vaccination timeline.
export const scheduleRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type OccurrenceParams = { childId: string; templateId: string; sequence: string };

const RECURRENCE_HORIZON_YEARS = 4;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// The "dynamically create... update dynamically later" requirement: for
// every recurring template where the child's latest occurrence has been
// completed, keep generating the next occurrence (basis + recurrenceMonths)
// as long as it falls within the next 4 years — both immediately after a
// completion (so a few years of reminders appear right away) and again on
// every plain GET (so the 4-year window keeps advancing on its own as real
// time passes, with no cron job needed).
async function topUpRecurringOccurrences(tx: Prisma.TransactionClient, childId: string): Promise<void> {
  const recurringTemplates = await tx.medicalScheduleTemplate.findMany({
    where: { isRecurring: true },
  });
  if (recurringTemplates.length === 0) return;

  const cap = new Date();
  cap.setFullYear(cap.getFullYear() + RECURRENCE_HORIZON_YEARS);

  for (const template of recurringTemplates) {
    const occurrences = await tx.childScheduleOccurrence.findMany({
      where: { childId, templateId: template.id },
      orderBy: { sequence: "asc" },
    });
    if (occurrences.length === 0) continue; // nothing planned/completed yet — nothing to extend

    let latest = occurrences[occurrences.length - 1];
    const recurrenceMonths = template.recurrenceMonths ?? 12;

    while (latest.completedAt) {
      const basis = latest.plannedAt ?? latest.completedAt;
      const nextDue = addMonths(basis, recurrenceMonths);
      if (nextDue > cap) break;

      const nextSequence = latest.sequence + 1;
      const created = await tx.childScheduleOccurrence.upsert({
        where: {
          childId_templateId_sequence: { childId, templateId: template.id, sequence: nextSequence },
        },
        create: { childId, templateId: template.id, sequence: nextSequence, plannedAt: nextDue },
        update: {},
      });
      if (created.sequence === latest.sequence) break; // safety net against an infinite loop
      latest = created;
    }
  }
}

scheduleRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const child = await prisma.child.findUniqueOrThrow({ where: { id: req.params.childId } });

    const { templates, occurrences } = await withRls(req.session.userId!, async (tx) => {
      await topUpRecurringOccurrences(tx, child.id);

      const templates = await tx.medicalScheduleTemplate.findMany({
        where: { countryCode: child.countryCode },
        orderBy: { ageInMonths: "asc" },
      });
      const occurrences = await tx.childScheduleOccurrence.findMany({
        where: { childId: child.id, templateId: { in: templates.map((t) => t.id) } },
        orderBy: { sequence: "asc" },
      });
      return { templates, occurrences };
    });

    const occurrencesByTemplate = new Map<string, typeof occurrences>();
    for (const o of occurrences) {
      const list = occurrencesByTemplate.get(o.templateId) ?? [];
      list.push(o);
      occurrencesByTemplate.set(o.templateId, list);
    }

    const items: ScheduleItem[] = [];
    let completedTemplateCount = 0;

    for (const t of templates) {
      const templateOccurrences = occurrencesByTemplate.get(t.id) ?? [];
      // No occurrence row yet just means "not planned, not completed" — same
      // as before, this doesn't require a DB row per template per child.
      const rows =
        templateOccurrences.length > 0
          ? templateOccurrences
          : [{ sequence: 0, plannedAt: null as Date | null, completedAt: null as Date | null }];

      if (rows.some((r) => r.completedAt)) completedTemplateCount++;

      for (const r of rows) {
        items.push({
          templateId: t.id,
          label: t.label,
          ageInMonths: t.ageInMonths,
          category: t.category,
          description: t.description,
          provider: t.provider,
          isRecurring: t.isRecurring,
          sequence: r.sequence,
          plannedAt: r.plannedAt?.toISOString() ?? null,
          completed: r.completedAt != null,
          completedAt: r.completedAt?.toISOString() ?? null,
        });
      }
    }

    const response: ChildScheduleResponse = {
      items,
      completedCount: completedTemplateCount,
      totalCount: templates.length,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// Upserts one occurrence — sets/clears its planned date and/or toggles
// completion. Replaces the old POST /:templateId/complete (which could only
// ever mark something done, never undo it, and had no concept of a planned
// date at all).
scheduleRouter.patch("/:templateId/occurrences/:sequence", async (req: Request<OccurrenceParams>, res, next) => {
  try {
    const sequence = Number(req.params.sequence);
    if (!Number.isInteger(sequence) || sequence < 0) {
      throw new ApiError(400, "Invalid occurrence sequence");
    }
    const body = req.body as UpdateScheduleOccurrenceRequest;

    await withRls(req.session.userId!, async (tx) => {
      const template = await tx.medicalScheduleTemplate.findUnique({
        where: { id: req.params.templateId },
      });
      if (!template) throw new ApiError(404, "Schedule template not found");

      const existing = await tx.childScheduleOccurrence.findUnique({
        where: {
          childId_templateId_sequence: { childId: req.params.childId, templateId: req.params.templateId, sequence },
        },
      });

      let completedAt = existing?.completedAt ?? null;
      if (body.completed === true && !completedAt) {
        // Only stamp a fresh completedAt the first time — re-editing the
        // planned date afterward (a separate call) shouldn't reset it.
        completedAt = new Date();
      } else if (body.completed === false) {
        completedAt = null;
      }

      let plannedAt = existing?.plannedAt ?? null;
      if (body.plannedAt !== undefined) {
        plannedAt = body.plannedAt ? new Date(body.plannedAt) : null;
      }

      await tx.childScheduleOccurrence.upsert({
        where: {
          childId_templateId_sequence: { childId: req.params.childId, templateId: req.params.templateId, sequence },
        },
        create: { childId: req.params.childId, templateId: req.params.templateId, sequence, plannedAt, completedAt },
        update: { plannedAt, completedAt },
      });

      if (template.isRecurring) {
        await topUpRecurringOccurrences(tx, req.params.childId);
      }
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
