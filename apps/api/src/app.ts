import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { config } from "./config";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { childrenRouter } from "./routes/children";
import { invitesRouter } from "./routes/invites";
import { mediaRouter } from "./routes/media";
import { messagesRouter } from "./routes/messages";
import { notesRouter } from "./routes/notes";
import { billingRouter } from "./routes/billing";
import { pushRouter } from "./routes/push";
import { notificationPreferencesRouter } from "./routes/notificationPreferences";
import { searchRouter } from "./routes/search";
import { categoriesRouter } from "./routes/categories";
import { overviewRouter } from "./routes/overview";
import { momentsFeedRouter } from "./routes/moments";
import { bookmarksRouter } from "./routes/bookmarks";
import { requireVerifiedPhone, sessionMiddleware } from "./middleware/session";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Raw request body bytes, captured below — needed to verify the
      // QuickPay webhook's HMAC checksum, which is computed over the exact
      // bytes QuickPay sent, not a re-serialized JSON.parse/stringify round
      // trip (whitespace/key-order can differ).
      rawBody?: Buffer;
    }
  }
}

// Express app construction only — no .listen() here, so tests (supertest)
// and the real process entrypoint (server.ts) can both use this without
// binding a port. Kept as a plain function-call module (not a class) to
// match the rest of the codebase's style.
export function createApp() {
  const app = express();

  // Nginx terminates TLS and reverse-proxies to this process over plain HTTP
  // (see docs/plesk_deployment.md step 5), so without this Express sees every request as
  // insecure and silently drops the session cookie whenever cookie.secure is
  // true in production (express-session won't set Set-Cookie over what it
  // thinks is an insecure connection). Trusting the first proxy hop makes
  // Express read req.secure from the X-Forwarded-Proto header nginx already
  // sends, which fixes that without weakening anything — only this one
  // process, reached only via the proxy, is trusted.
  if (config.isProduction) {
    app.set("trust proxy", 1);
  }

  // Security-review pass — baseline response headers (X-Content-Type-Options,
  // a restrictive default CSP, Referrer-Policy, etc.) this API never had.
  // crossOriginResourcePolicy is relaxed from helmet's own default
  // (same-origin) to cross-origin: the web app at kidcom.org loads media
  // (GET /media/:id) directly from api.kidcom.org via plain <img>/<video>
  // tags — a different origin by design (see docs/plesk_deployment.md) — same-origin
  // CORP would silently block every one of those. CSP itself is close to a
  // no-op for a pure JSON+file API (no HTML is ever served here to protect),
  // left at helmet's default rather than disabled since it's harmless.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    })
  );
  app.use(cookieParser());
  app.use(sessionMiddleware);
  app.use(requireVerifiedPhone);

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/children", childrenRouter);
  app.use("/invites", invitesRouter);
  app.use("/media", mediaRouter);
  app.use("/messages", messagesRouter);
  app.use("/notes", notesRouter);
  app.use("/billing", billingRouter);
  app.use("/push", pushRouter);
  app.use("/notification-preferences", notificationPreferencesRouter);
  app.use("/search", searchRouter);
  app.use("/categories", categoriesRouter);
  app.use("/overview", overviewRouter);
  app.use("/moments", momentsFeedRouter);
  app.use("/bookmarks", bookmarksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
