import type { NextFunction, Request, Response } from "express";
import type { AccessRole, RelationshipType } from "@kinnd/shared";

import { prisma } from "../db";
import { ApiError } from "./errorHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      childAccess?: {
        childId: string;
        role: AccessRole;
        relationship: RelationshipType;
        medicalInfoAccess: boolean;
        isMinorMember: boolean;
      };
    }
  }
}

// Gates any route with a `:childId` param — every future child-scoped
// feature (calendar, moments, media, lists) reuses this rather than
// re-implementing the ChildAccess check. Must run after requireAuth. Also
// the source of the fields the permission matrix (lib/permissions.ts)
// needs — attached here so route handlers don't each run their own lookup.
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
      req.childAccess = {
        childId: access.childId,
        role: access.role,
        relationship: access.relationship,
        medicalInfoAccess: access.medicalInfoAccess,
        isMinorMember: access.isMinorMember,
      };
      next();
    })
    .catch(next);
}
