import type { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  status: number;
  /** Stable machine-readable reason (e.g. "PASSWORD_REUSED"); clients translate by it. */
  code?: string;
  /** Extra machine-readable context for the client (e.g. which children block an action). */
  details?: Record<string, unknown>;
  constructor(status: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Centralized error handler — every route should funnel errors here via
// next(err) rather than formatting responses inline.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  const status = err instanceof ApiError ? err.status : 500;
  // Only deliberate ApiErrors carry their message to the client; anything
  // unexpected is logged here and answered generically (no internals leak).
  const message = err instanceof ApiError ? err.message : "Internal server error";
  const code = err instanceof ApiError ? err.code : undefined;
  const details = err instanceof ApiError ? err.details : undefined;

  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(status).json({ error: message, ...(code ? { code } : {}), ...(details ? { details } : {}) });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}
