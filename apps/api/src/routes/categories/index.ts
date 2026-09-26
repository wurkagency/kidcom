import { Router } from "express";
import type { CategoriesResponse, CreateCategoryRequest, UpdateCategoryRequest } from "@kinnd/shared";
import { isCategoryTone } from "@kinnd/shared";

import { prisma } from "../../db";
import { requireAuth } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import { toCategoryDto, visibleCategories } from "../../lib/categories";
import { withRlsBypass } from "../../lib/rls";
import { requiredText } from "../../lib/validation";

// /categories — the global set shared by Calendar, Moments and Media
// (Preferences → Categories). System categories are read-only; a custom
// category can only be changed by its owner. Deleting one that is in use
// archives it instead, so existing items keep their label.
export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

const ICON = /^[a-z0-9_]{2,40}$/;

function icon(value: unknown): string {
  if (typeof value !== "string" || !ICON.test(value)) throw new ApiError(400, "icon must be a Material Symbols name");
  return value;
}

function tone(value: unknown) {
  if (!isCategoryTone(value)) throw new ApiError(400, "Unknown tone");
  return value;
}

async function ownCategory(id: string, userId: string) {
  const row = await prisma.category.findUnique({ where: { id } });
  if (!row || row.ownerId !== userId) {
    throw new ApiError(row && !row.ownerId ? 403 : 404, row && !row.ownerId ? "Built-in categories can't be changed" : "Category not found");
  }
  return row;
}

categoriesRouter.get("/", async (req, res, next) => {
  try {
    res.json({ categories: await visibleCategories(req.session.userId!) } satisfies CategoriesResponse);
  } catch (err) {
    next(err);
  }
});

categoriesRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body as Partial<CreateCategoryRequest>;
    const userId = req.session.userId!;
    if ((await prisma.category.count({ where: { ownerId: userId, archivedAt: null } })) >= 50) {
      throw new ApiError(400, "You can have up to 50 categories");
    }
    const row = await prisma.category.create({
      data: { ownerId: userId, name: requiredText(body.name, "name", 40), icon: icon(body.icon), tone: tone(body.tone), sortOrder: 1000 },
    });
    res.status(201).json(toCategoryDto(row, userId));
  } catch (err) {
    next(err);
  }
});

categoriesRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = req.body as Partial<UpdateCategoryRequest>;
    const userId = req.session.userId!;
    await ownCategory(req.params.id, userId);
    const row = await prisma.category.update({
      where: { id: req.params.id },
      data: {
        name: body.name === undefined ? undefined : requiredText(body.name, "name", 40),
        icon: body.icon === undefined ? undefined : icon(body.icon),
        tone: body.tone === undefined ? undefined : tone(body.tone),
      },
    });
    res.json(toCategoryDto(row, userId));
  } catch (err) {
    next(err);
  }
});

categoriesRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    await ownCategory(req.params.id, userId);
    // Usage spans other families' child-scoped rows (RLS-protected); counted
    // with the bypass, or RLS would report 0 and the delete would orphan them.
    const used = { categoryIds: { has: req.params.id } };
    const counts = await withRlsBypass((tx) =>
      Promise.all([
        tx.calendarEvent.count({ where: used }),
        tx.calendarEventRequest.count({ where: used }),
        tx.task.count({ where: used }),
        tx.childNote.count({ where: used }),
        tx.moment.count({ where: used }),
      ]),
    );
    // In use anywhere: archive it (items keep showing it); else delete.
    const inUse = counts.some((n) => n > 0);
    if (inUse) {
      await prisma.category.update({ where: { id: req.params.id }, data: { archivedAt: new Date() } });
    } else {
      await prisma.category.delete({ where: { id: req.params.id } });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
