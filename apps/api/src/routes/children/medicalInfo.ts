import { Router, type Request } from "express";
import type {
  CreateMedicalInfoRequest,
  MedicalInfoEntry,
  UpdateMedicalInfoRequest,
} from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { canViewMedicalInfo, requireCapability } from "../../lib/permissions";
import { decryptField, decryptNullableField, encryptField, encryptNullableField } from "../../lib/medicalEncryption";

// Mounted at /children/:childId/medical-info — mergeParams so req.params.childId
// is visible here even though this router is defined in its own file.
// Note: mergeParams only affects runtime param merging, not TS inference —
// Express infers Request's Params generic from each route's own path string
// (e.g. "/" -> {}), so :childId (and :id) need to be typed explicitly here.
export const medicalInfoRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ChildEntryParams = { childId: string; id: string };

// Post-launch backlog Phase G — condition/description/emergencyNote are
// stored encrypted (see lib/medicalEncryption.ts); this is the one place
// they're decrypted back to plaintext for the API's own callers, matching
// the "encrypted at rest, plaintext everywhere the app actually reads it"
// goal — the API's response shape/callers are unchanged.
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
    condition: decryptField(row.condition),
    description: decryptNullableField(row.description),
    emergencyNote: decryptNullableField(row.emergencyNote),
  };
}

medicalInfoRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    // spec §1.4: PARENT always; FAMILY/Caregiver only with the per-member
    // opt-in a parent grants (special-category data about a minor, GDPR
    // Art. 9 — default-off, not inherited from general child access).
    if (!req.childAccess || !canViewMedicalInfo(req.childAccess)) {
      throw new ApiError(403, "You don't have permission to view medical info for this child");
    }
    const rows = await prisma.medicalInfo.findMany({
      where: { childId: req.params.childId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ items: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
});

medicalInfoRouter.post("/", requireCapability("medical_info:edit"), async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateMedicalInfoRequest>;
    if (!body.category || !body.condition) {
      throw new ApiError(400, "category and condition are required");
    }
    const row = await prisma.medicalInfo.create({
      data: {
        childId: req.params.childId,
        category: body.category,
        condition: encryptField(body.condition),
        description: encryptNullableField(body.description),
        emergencyNote: encryptNullableField(body.emergencyNote),
      },
    });
    res.status(201).json(toDto(row));
  } catch (err) {
    next(err);
  }
});

medicalInfoRouter.patch("/:id", requireCapability("medical_info:edit"), async (req: Request<ChildEntryParams>, res, next) => {
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
        condition: body.condition !== undefined ? encryptField(body.condition) : undefined,
        description: encryptNullableField(body.description),
        emergencyNote: encryptNullableField(body.emergencyNote),
      },
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

medicalInfoRouter.delete("/:id", requireCapability("medical_info:edit"), async (req: Request<ChildEntryParams>, res, next) => {
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
