import { Router } from "express";
import type { ListItemsResponse } from "@kidcom/shared";

import { requireAuth } from "../../middleware/session";
import { withRls } from "../../lib/rls";
import { LIST_ITEM_INCLUDE, toListItemDto } from "../children/listItems";

// The Lists tab: necessities or wishlist items across every child the user
// can see (RLS decides), narrowed by ?childIds= (the header's child
// selector) and ?type=NECESSITY|WISHLIST. Open items first, soonest due first.
export const listsRouter = Router();

listsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const childIds = typeof req.query.childIds === "string" ? req.query.childIds.split(",").filter(Boolean) : [];
    const type = req.query.type === "WISHLIST" ? "WISHLIST" : req.query.type === "NECESSITY" ? "NECESSITY" : undefined;
    const rows = await withRls(req.session.userId!, (tx) =>
      tx.listItem.findMany({
        where: {
          ...(type ? { type } : {}),
          ...(childIds.length ? { childId: { in: childIds } } : {}),
          child: { deletedAt: null },
        },
        include: LIST_ITEM_INCLUDE,
        orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        take: 500,
      })
    );
    const body: ListItemsResponse = { items: rows.map(toListItemDto) };
    res.json(body);
  } catch (err) {
    next(err);
  }
});
