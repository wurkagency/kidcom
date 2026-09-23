import { Router, type Request } from "express";
import type { ChildNoteDto, CreateChildNoteRequest, UpdateChildNoteRequest } from "@kidcom/shared";

import { ApiError } from "../../middleware/errorHandler";
import { requireCapability } from "../../lib/permissions";
import { withRls } from "../../lib/rls";
import { assertUsableCategory } from "../../lib/categories";
import { optionalText, requiredText } from "../../lib/validation";

// Mounted at /children/:childId/notes — notes shared with everyone who can
// see the child ("Written by Mom"). The author edits their own note;
// parents and guardians may also remove any note (moderation).
export const childNotesRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type NoteParams = { childId: string; id: string };

export function toChildNoteDto(row: {
  id: string;
  childId: string;
  title: string;
  text: string | null;
  categoryId: string | null;
  authorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ChildNoteDto {
  return {
    id: row.id,
    childId: row.childId,
    title: row.title,
    text: row.text,
    categoryId: row.categoryId,
    authorUserId: row.authorId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

childNotesRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const rows = await withRls(req.session.userId!, (tx) =>
      tx.childNote.findMany({ where: { childId: req.params.childId }, orderBy: { createdAt: "desc" }, take: 100 })
    );
    res.json({ notes: rows.map(toChildNoteDto) });
  } catch (err) {
    next(err);
  }
});

childNotesRouter.post("/", requireCapability("note:write"), async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateChildNoteRequest>;
    const userId = req.session.userId!;
    const data = {
      childId: req.params.childId,
      authorId: userId,
      title: requiredText(body.title, "title"),
      text: optionalText(body.text, "text", 5000) ?? null,
      categoryId: await assertUsableCategory(userId, body.categoryId),
    };
    const row = await withRls(userId, (tx) => tx.childNote.create({ data }));
    res.status(201).json(toChildNoteDto(row));
  } catch (err) {
    next(err);
  }
});

childNotesRouter.patch("/:id", async (req: Request<NoteParams>, res, next) => {
  try {
    const body = req.body as Partial<UpdateChildNoteRequest>;
    const userId = req.session.userId!;
    const data = {
      title: body.title === undefined ? undefined : requiredText(body.title, "title"),
      text: optionalText(body.text, "text", 5000),
      categoryId: body.categoryId === undefined ? undefined : await assertUsableCategory(userId, body.categoryId),
    };
    const row = await withRls(userId, async (tx) => {
      const existing = await tx.childNote.findFirst({ where: { id: req.params.id, childId: req.params.childId } });
      if (!existing) throw new ApiError(404, "Note not found");
      if (existing.authorId !== userId) throw new ApiError(403, "Only the author can edit this note");
      return tx.childNote.update({ where: { id: existing.id }, data });
    });
    res.json(toChildNoteDto(row));
  } catch (err) {
    next(err);
  }
});

childNotesRouter.delete("/:id", async (req: Request<NoteParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const moderator = req.childAccess!.role === "PARENT" || req.childAccess!.role === "GUARDIAN";
    await withRls(userId, async (tx) => {
      const existing = await tx.childNote.findFirst({ where: { id: req.params.id, childId: req.params.childId } });
      if (!existing) throw new ApiError(404, "Note not found");
      if (existing.authorId !== userId && !moderator) throw new ApiError(403, "Only the author can delete this note");
      await tx.childNote.delete({ where: { id: existing.id } });
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
