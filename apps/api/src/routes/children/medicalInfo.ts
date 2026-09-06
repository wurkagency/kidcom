import { Router, type Request } from "express";
import type {
  CreateMedicalInfoRequest,
  MedicalInfoEntry,
  UpdateMedicalInfoRequest,
} from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";

// Mounted at /children/:childId/medical-info — mergeParams so req.params.childId
// is visible here even though this router is defined in its own file.
// Note: mergeParams only affects runtime param merging, not TS inference —
// Express infers Request's Params generic from each route's own path string
// (e.g. "/" -> {}), so :childId (and :id) need to be typed explicitly here.
export const medicalInfoRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ChildEntryParams = { childId: string; id: string };

function toDto(row: {
  id: string;
  category: "ALLERGY" | "CONDITION";
  condition: string;
  description: string | null;
  emergencyNote: string | null;
}): MedicalInfoEntry {
  return {
    id: row.id,
    category: row.category,
    condition: row.condition,
    description: row.description,
    emergencyNote: row.emergencyNote,
  };
}

medicalInfoRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const rows = await prisma.medicalInfo.findMany({
      where: { childId: req.params.childId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ items: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
});

medicalInfoRouter.post("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateMedicalInfoRequest>;
    if (!body.category || !body.condition) {
      throw new ApiError(400, "category and condition are required");
    }
    const row = await prisma.medicalInfo.create({
      data: {
        childId: req.params.childId,
        category: body.category,
        condition: body.condition,
        description: body.description,
        emergencyNote: body.emergencyNote,
      },
    });
    res.status(201).json(toDto(row));
  } catch (err) {
    next(err);
  }
});

medicalInfoRouter.patch("/:id", async (req: Request<ChildEntryParams>, res, next) => {
  try {
    const body = req.body as UpdateMedicalInfoRequest;
    const existing = await prisma.medicalInfo.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "Medical info entry not found");

    const row = await prisma.medicalInfo.update({
      where: { id: req.params.id },
      data: {
        category: body.category,
        condition: body.condition,
        description: body.description,
        emergencyNote: body.emergencyNote,
      },
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

medicalInfoRouter.delete("/:id", async (req: Request<ChildEntryParams>, res, next) => {
  try {
    const existing = await prisma.medicalInfo.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "Medical info entry not found");

    await prisma.medicalInfo.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
