import { Router, type Request } from "express";
import type {
  CreateEmergencyContactRequest,
  EmergencyContactDto,
  UpdateEmergencyContactRequest,
} from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";

// Mounted at /children/:childId/emergency-contacts.
export const emergencyContactsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ChildEntryParams = { childId: string; id: string };

// GET merges manually-added rows (pediatrician, dentist, school, poison
// control — the mockup's Medical Providers/Other Contacts sections) with
// family members auto-derived from ChildAccess (Mom/Dad don't need to be
// re-entered as contacts). Derived rows have `derived: true` and no id that
// can be PATCHed/DELETEd here.
emergencyContactsRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const childId = req.params.childId;
    const [manual, access] = await Promise.all([
      prisma.emergencyContact.findMany({ where: { childId }, orderBy: { createdAt: "asc" } }),
      prisma.childAccess.findMany({ where: { childId }, include: { user: true } }),
    ]);

    const derived: EmergencyContactDto[] = access.map((a) => ({
      id: `family-${a.userId}`,
      category: "FAMILY",
      name: `${a.role === "PARENT" ? "Parent" : "Family"} (${a.user.firstName})`,
      role: a.role === "PARENT" ? "Parent" : "Family member",
      phone: a.user.phone,
      location: null,
      avatarUrl: a.user.avatarUrl,
      derived: true,
    }));

    const manualDtos: EmergencyContactDto[] = manual.map((row) => ({
      id: row.id,
      category: row.category,
      name: row.name,
      role: row.role,
      phone: row.phone,
      location: row.location,
      // Manually-added contacts (pediatrician, school, etc.) have no photo
      // field — only real family-member users (above) do.
      avatarUrl: null,
      derived: false,
    }));

    res.json({ items: [...derived, ...manualDtos] });
  } catch (err) {
    next(err);
  }
});

emergencyContactsRouter.post("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateEmergencyContactRequest>;
    if (!body.category || !body.name || !body.role || !body.phone) {
      throw new ApiError(400, "category, name, role, and phone are required");
    }
    if ((body.category as string) === "FAMILY") {
      throw new ApiError(400, "FAMILY contacts are derived automatically and can't be added manually");
    }
    const row = await prisma.emergencyContact.create({
      data: {
        childId: req.params.childId,
        category: body.category,
        name: body.name,
        role: body.role,
        phone: body.phone,
        location: body.location,
      },
    });
    res.status(201).json({
      id: row.id,
      category: row.category,
      name: row.name,
      role: row.role,
      phone: row.phone,
      location: row.location,
      avatarUrl: null,
      derived: false,
    } satisfies EmergencyContactDto);
  } catch (err) {
    next(err);
  }
});

emergencyContactsRouter.patch("/:id", async (req: Request<ChildEntryParams>, res, next) => {
  try {
    const body = req.body as UpdateEmergencyContactRequest;
    const existing = await prisma.emergencyContact.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "Contact not found");

    const row = await prisma.emergencyContact.update({
      where: { id: req.params.id },
      data: {
        category: body.category,
        name: body.name,
        role: body.role,
        phone: body.phone,
        location: body.location,
      },
    });
    res.json({
      id: row.id,
      category: row.category,
      name: row.name,
      role: row.role,
      phone: row.phone,
      location: row.location,
      avatarUrl: null,
      derived: false,
    } satisfies EmergencyContactDto);
  } catch (err) {
    next(err);
  }
});

emergencyContactsRouter.delete("/:id", async (req: Request<ChildEntryParams>, res, next) => {
  try {
    const existing = await prisma.emergencyContact.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "Contact not found");

    await prisma.emergencyContact.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
