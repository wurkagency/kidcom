import { Router } from "express";
import type { ApiHealthResponse } from "@kinnd/shared";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const body: ApiHealthResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
  res.json(body);
});
