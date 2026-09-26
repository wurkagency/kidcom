import type { Prisma } from "@kinnd/db";
import type { CategoryDto } from "@kinnd/shared";
import { SYSTEM_CATEGORIES, systemCategoryId } from "@kinnd/shared";

import { prisma } from "../db";
import { ApiError } from "../middleware/errorHandler";

// The global category set (packages/shared/src/categories.ts). System rows
// have fixed ids ("cat_<key>") so code and migrations can refer to them.

/** Creates/updates the system categories. Idempotent; run at startup. */
export async function ensureSystemCategories(db: Prisma.TransactionClient | typeof prisma = prisma) {
  for (const [sortOrder, c] of SYSTEM_CATEGORIES.entries()) {
    await db.category.upsert({
      where: { id: systemCategoryId(c.key) },
      create: { id: systemCategoryId(c.key), key: c.key, icon: c.icon, tone: c.tone, sortOrder },
      update: { key: c.key, icon: c.icon, tone: c.tone, sortOrder, archivedAt: null },
    });
  }
}

/**
 * Users whose custom categories `userId` can see: themselves plus everyone
 * who shares a child with them (so a category on a shared item is always
 * resolvable by everyone who can see that item).
 */
async function circleUserIds(userId: string): Promise<string[]> {
  const mine = await prisma.childAccess.findMany({ where: { userId }, select: { childId: true } });
  if (mine.length === 0) return [userId];
  const members = await prisma.childAccess.findMany({
    where: { childId: { in: mine.map((a) => a.childId) } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return [...new Set([userId, ...members.map((m) => m.userId)])];
}

type CategoryRow = {
  id: string;
  key: string | null;
  name: string | null;
  icon: string;
  tone: CategoryDto["tone"];
  sortOrder: number;
  ownerId: string | null;
  archivedAt: Date | null;
};

export function toCategoryDto(row: CategoryRow, viewerId: string): CategoryDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    icon: row.icon,
    tone: row.tone,
    sortOrder: row.sortOrder,
    ownedByMe: row.ownerId !== null && row.ownerId === viewerId,
    archived: row.archivedAt !== null,
  };
}

/** System categories + the custom categories of the viewer's family circle. */
export async function visibleCategories(userId: string): Promise<CategoryDto[]> {
  const owners = await circleUserIds(userId);
  const rows = await prisma.category.findMany({
    where: { OR: [{ ownerId: null }, { ownerId: { in: owners } }] },
    orderBy: [{ ownerId: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => toCategoryDto(r, userId));
}

/** Most categories one item can carry. */
export const MAX_CATEGORIES_PER_ITEM = 10;

/**
 * Validates the categories chosen for a new or edited item: each must exist,
 * be visible to the user and not be archived. Returns them de-duplicated, in
 * the order given; undefined stays undefined (a PATCH that leaves them alone).
 */
export async function assertUsableCategories(userId: string, categoryIds: unknown): Promise<string[]>;
export async function assertUsableCategories(userId: string, categoryIds: unknown, partial: "partial"): Promise<string[] | undefined>;
export async function assertUsableCategories(userId: string, categoryIds: unknown, partial?: "partial"): Promise<string[] | undefined> {
  if (categoryIds === undefined) return partial ? undefined : [];
  if (categoryIds === null) return [];
  if (!Array.isArray(categoryIds) || !categoryIds.every((id) => typeof id === "string")) {
    throw new ApiError(400, "categoryIds must be a list of category ids");
  }
  const ids = [...new Set(categoryIds as string[])];
  if (ids.length > MAX_CATEGORIES_PER_ITEM) throw new ApiError(400, `At most ${MAX_CATEGORIES_PER_ITEM} categories`);
  if (ids.length === 0) return [];
  const rows = await prisma.category.findMany({ where: { id: { in: ids } } });
  const circle = rows.some((r) => r.ownerId) ? await circleUserIds(userId) : [];
  for (const id of ids) {
    const row = rows.find((r) => r.id === id);
    if (!row || row.archivedAt || (row.ownerId && !circle.includes(row.ownerId))) {
      throw new ApiError(400, "Unknown category", "CATEGORY_UNKNOWN");
    }
  }
  return ids;
}
