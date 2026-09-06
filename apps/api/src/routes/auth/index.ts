import { Router } from "express";
import bcrypt from "bcryptjs";
import type {
  LoginRequest,
  MeResponse,
  PublicUser,
  SignupRequest,
} from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";

export const authRouter = Router();

const SALT_ROUNDS = 10;

function toPublicUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
  };
}

authRouter.post("/signup", async (req, res, next) => {
  try {
    const body = req.body as Partial<SignupRequest>;
    const email = body.email?.trim().toLowerCase();
    const { password, firstName, lastName } = body;

    if (!email || !password || !firstName || !lastName) {
      throw new ApiError(400, "email, password, firstName, and lastName are required");
    }
    if (password.length < 8) {
      throw new ApiError(400, "Password must be at least 8 characters long");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(409, "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Every new account starts on the Free tier (PRD pricing section) —
    // status ACTIVE and trialEndsAt: null since an organic Free signup
    // never expires (contrast with invites/index.ts, where an invited
    // user's Free account gets a 30-day trial clock).
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, passwordHash, firstName, lastName },
      });
      await tx.subscription.create({
        data: { ownerId: created.id, tier: "FREE", status: "ACTIVE", trialEndsAt: null },
      });
      return created;
    });

    req.session.userId = user.id;
    res.status(201).json({ user: toPublicUser(user) } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const body = req.body as Partial<LoginRequest>;
    const email = body.email?.trim().toLowerCase();
    const { password } = body;

    if (!email || !password) {
      throw new ApiError(400, "email and password are required");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new ApiError(401, "Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new ApiError(401, "Invalid email or password");
    }

    req.session.userId = user.id;
    res.json({ user: toPublicUser(user) } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      next(err);
      return;
    }
    res.clearCookie("kidcom.sid");
    res.status(204).end();
  });
});

// Swaps the caller's avatar to a MediaAsset they already uploaded via
// POST /media/upload. The asset must belong to them (avatars aren't shared
// uploads). Clearing the old asset's avatarForUserId before/alongside
// setting the new one in the same transaction keeps the unique constraint
// from ever seeing two assets claim the same user simultaneously.
authRouter.patch("/me", async (req, res, next) => {
  try {
    if (!req.session.userId) {
      throw new ApiError(401, "Not signed in");
    }
    const { avatarMediaAssetId } = req.body as { avatarMediaAssetId?: string };
    if (!avatarMediaAssetId) {
      throw new ApiError(400, "avatarMediaAssetId is required");
    }

    const asset = await prisma.mediaAsset.findUnique({ where: { id: avatarMediaAssetId } });
    if (!asset) {
      throw new ApiError(404, "Media not found");
    }
    if (asset.ownerId !== req.session.userId) {
      throw new ApiError(403, "You don't have access to this media");
    }

    const user = await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.updateMany({
        where: { avatarForUserId: req.session.userId! },
        data: { avatarForUserId: null },
      });
      await tx.mediaAsset.update({
        where: { id: avatarMediaAssetId },
        data: { avatarForUserId: req.session.userId! },
      });
      return tx.user.update({
        where: { id: req.session.userId! },
        data: { avatarUrl: avatarMediaAssetId },
      });
    });

    res.json({ user: toPublicUser(user) } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    if (!req.session.userId) {
      res.json({ user: null } satisfies MeResponse);
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user) {
      res.json({ user: null } satisfies MeResponse);
      return;
    }
    res.json({ user: toPublicUser(user) } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
});
