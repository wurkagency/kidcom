import type { NextFunction, Request, Response } from "express";

import { prisma } from "../db";
import { ApiError } from "./errorHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      childAccess?: { childId: string; role: "PARENT" | "FAMILY" };
    }
  }
}

// Gates any route with a `:childId` param — every future child-scoped
// feature (calendar, journal, media, lists) reuses this rather than
// re-implementing the ChildAccess check. Must run after requireAuth.
export function requireChildAccess(req: Request, _res: Response, next: NextFunction) {
  const childId = req.params.childId;
  if (!childId) {
    next(new ApiError(400, "childId param is required"));
    return;
  }
  if (!req.session.userId) {
    next(new ApiError(401, "Authentication required"));
    return;
  }

  prisma.childAccess
    .findUnique({
      where: { childId_userId: { childId, userId: req.session.userId } },
    })
    .then((access) => {
      if (!access) {
        next(new ApiError(403, "You don't have access to this child"));
        return;
      }
      req.childAccess = { childId: access.childId, role: access.role };
      next();
    })
    .catch(next);
}
