import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../app";
import { resetDb } from "../testUtils/db";

// Phase 0 proof: the test harness itself works end to end — a real HTTP
// request through the real Express app, against the real (test) Postgres
// database, with a truncate between tests.
describe("GET /health", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns ok status", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.timestamp).toBe("string");
  });
});
