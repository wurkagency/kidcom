import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

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
import { sessionMiddleware } from "./middleware/session";
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

const app = express();

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

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/children", childrenRouter);
app.use("/invites", invitesRouter);
app.use("/media", mediaRouter);
app.use("/messages", messagesRouter);
app.use("/notes", notesRouter);
app.use("/billing", billingRouter);
app.use("/push", pushRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`KidCom API listening on port ${config.port} (${config.nodeEnv})`);
});
