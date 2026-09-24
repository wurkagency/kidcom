import type { NextFunction, Request, Response } from "express";

import { config } from "../config";
import { ApiError } from "./errorHandler";

// CSRF defence on top of the SameSite=Lax session cookie. The KidCom app
// sends this header on every API request (packages/core/src/api/client.ts).
// A page on another origin can't: a custom header makes the browser ask
// CORS first, and the API only answers the app's own origin. So a forged
// form post or <img> from anywhere else — including another *.kidcom.org
// site, which SameSite treats as "same site" — can't change anything.
export const CLIENT_HEADER = "X-KidCom-Client";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Called by other servers, not the app: QuickPay's payment callback (signed).
const EXEMPT_PATHS = new Set(["/billing/webhook"]);

export function requireClientHeader(req: Request, _res: Response, next: NextFunction) {
  if (!config.requireClientHeader || SAFE_METHODS.has(req.method) || EXEMPT_PATHS.has(req.path)) return next();
  if (req.get(CLIENT_HEADER) !== "1") {
    return next(new ApiError(403, "This request must come from the KidCom app", "CLIENT_HEADER_REQUIRED"));
  }
  next();
}
