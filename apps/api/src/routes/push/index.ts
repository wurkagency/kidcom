import { Router } from "express";
import type { PushSubscribeRequest, VapidPublicKeyResponse } from "@kidcom/shared";

import { prisma } from "../../db";
import { config } from "../../config";
import { requireAuth } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";

export const pushRouter = Router();

pushRouter.use(requireAuth);

pushRouter.get("/vapid-public-key", (_req, res, next) => {
  try {
    if (!config.vapidPublicKey) {
      throw new ApiError(500, "Push isn't configured on this server yet");
    }
    res.json({ publicKey: config.vapidPublicKey } satisfies VapidPublicKeyResponse);
  } catch (err) {
    next(err);
  }
});

// Upserts by endpoint — the same device re-subscribing (e.g. after a
// permission change) just updates its keys rather than creating a
// duplicate row.
pushRouter.post("/subscribe", async (req, res, next) => {
  try {
    const body = req.body as Partial<PushSubscribeRequest>;
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      throw new ApiError(400, "endpoint and keys.p256dh/keys.auth are required");
    }
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { userId: req.session.userId!, p256dh: body.keys.p256dh, auth: body.keys.auth },
      create: {
        userId: req.session.userId!,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

pushRouter.delete("/subscribe", async (req, res, next) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;
    if (!endpoint) {
      throw new ApiError(400, "endpoint query param is required");
    }
    // Only ever deletes the caller's own subscription — endpoints are
    // effectively unguessable, but scoping by userId costs nothing.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.session.userId! } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
