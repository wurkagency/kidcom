import { prisma } from "../db";

// spec 9.21/§1.4a.4 — "all PARENT members must confirm; if the child has no
// PARENT member, all GUARDIAN members may confirm instead." Always computed
// live from the current ChildAccess rows, never from a snapshot taken when
// the deletion request was opened — a member who joins or leaves mid-request
// is picked up correctly on the very next confirm/cancel/check. I-3 (a child
// always has ≥1 coverage-eligible member) guarantees this never comes back
// empty.
export async function requiredConfirmerIds(childId: string): Promise<string[]> {
  const parents = await prisma.childAccess.findMany({
    where: { childId, role: "PARENT" },
    select: { userId: true },
  });
  if (parents.length > 0) return parents.map((p) => p.userId);
  const guardians = await prisma.childAccess.findMany({
    where: { childId, role: "GUARDIAN" },
    select: { userId: true },
  });
  return guardians.map((g) => g.userId);
}
