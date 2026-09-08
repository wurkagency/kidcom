import { Router } from "express";
import type { CreatePersonalNoteRequest, NoteCategory, PersonalNoteDto, UpdatePersonalNoteRequest } from "@kidcom/shared";

import { prisma } from "../../db";
import { requireAuth } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";

// Top-level, not child-scoped — a private per-user scratchpad. Every route
// implicitly filters to the caller's own notes; there's no sharing here.
export const notesRouter = Router();

notesRouter.use(requireAuth);

const VALID_CATEGORIES: NoteCategory[] = ["ROUTINE", "MILESTONE", "HEALTH", "GENERAL"];

function toDto(row: {
  id: string;
  text: string;
  category: NoteCategory | null;
  createdAt: Date;
  updatedAt: Date;
}): PersonalNoteDto {
  return {
    id: row.id,
    text: row.text,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

notesRouter.get("/", async (req, res, next) => {
  try {
    const rows = await prisma.personalNote.findMany({
      where: { userId: req.session.userId! },
      orderBy: { createdAt: "desc" },
    });
    res.json({ items: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
});

notesRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body as Partial<CreatePersonalNoteRequest>;
    if (!body.text?.trim()) {
      throw new ApiError(400, "text is required");
    }
    if (body.category != null && !VALID_CATEGORIES.includes(body.category)) {
      throw new ApiError(400, "Invalid category");
    }
    const row = await prisma.personalNote.create({
      data: { userId: req.session.userId!, text: body.text.trim(), category: body.category ?? null },
    });
    res.status(201).json(toDto(row));
  } catch (err) {
    next(err);
  }
});

notesRouter.patch("/:noteId", async (req, res, next) => {
  try {
    const body = req.body as Partial<UpdatePersonalNoteRequest>;
    if (body.text !== undefined && !body.text.trim()) {
      throw new ApiError(400, "text cannot be empty");
    }
    if (body.category != null && !VALID_CATEGORIES.includes(body.category)) {
      throw new ApiError(400, "Invalid category");
    }
    const existing = await prisma.personalNote.findFirst({
      where: { id: req.params.noteId, userId: req.session.userId! },
    });
    if (!existing) throw new ApiError(404, "Note not found");

    const row = await prisma.personalNote.update({
      where: { id: existing.id },
      data: {
        ...(body.text !== undefined ? { text: body.text.trim() } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
      },
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

notesRouter.delete("/:noteId", async (req, res, next) => {
  try {
    const existing = await prisma.personalNote.findFirst({
      where: { id: req.params.noteId, userId: req.session.userId! },
    });
    if (!existing) throw new ApiError(404, "Note not found");
    await prisma.personalNote.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
