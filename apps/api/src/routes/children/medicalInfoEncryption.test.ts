import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../../app";
import { resetDb } from "../../testUtils/db";
import { signupTestUser } from "../../testUtils/auth";
import { withRls } from "../../lib/rls";

// Post-launch backlog Phase G proof — asserts the stored DB row is NOT
// plaintext (queried directly, bypassing the API's own decrypt-on-read),
// while the API's own GET still returns the correct plaintext — proves the
// encryption is real, not just that the helper functions round-trip in
// isolation (medicalEncryption.test.ts already covers that).
describe("MedicalInfo encryption at rest (spec-adjacent, Phase G)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("the raw DB value is not plaintext, but the API returns the correct plaintext", async () => {
    const app = createApp();
    const { agent, userId } = await signupTestUser(app, { email: "medenc-parent@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const condition = "Severe peanut allergy — carries an EpiPen";
    const description = "Diagnosed at age 2, confirmed by allergist";
    const emergencyNote = "Call 112 immediately if exposed";

    const createRes = await agent.post(`/children/${childId}/medical-info`).send({
      category: "ALLERGY",
      condition,
      description,
      emergencyNote,
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.condition).toBe(condition);
    expect(createRes.body.description).toBe(description);
    expect(createRes.body.emergencyNote).toBe(emergencyNote);

    // Bypass the API entirely — read the raw column values directly (still
    // through withRls: RLS is on now, and this user genuinely has access).
    const raw = await withRls(userId, (tx) => tx.medicalInfo.findUniqueOrThrow({ where: { id: createRes.body.id } }));
    expect(raw.condition).not.toBe(condition);
    expect(raw.condition).not.toContain("peanut");
    expect(raw.description).not.toBe(description);
    expect(raw.emergencyNote).not.toBe(emergencyNote);
    // Encoded as iv:authTag:ciphertext (all base64) — confirms the shape,
    // not just "it's different."
    expect(raw.condition.split(":")).toHaveLength(3);

    const listRes = await agent.get(`/children/${childId}/medical-info`);
    expect(listRes.body.items[0].condition).toBe(condition);
    expect(listRes.body.items[0].description).toBe(description);
    expect(listRes.body.items[0].emergencyNote).toBe(emergencyNote);
  });

  it("updating an entry re-encrypts the new value, decryptable again on read", async () => {
    const app = createApp();
    const { agent, userId } = await signupTestUser(app, { email: "medenc-update@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Kid", gender: "GIRL", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const createRes = await agent.post(`/children/${childId}/medical-info`).send({ category: "CONDITION", condition: "Asthma" });
    const patchRes = await agent
      .patch(`/children/${childId}/medical-info/${createRes.body.id}`)
      .send({ condition: "Asthma (mild, controlled with inhaler)" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.condition).toBe("Asthma (mild, controlled with inhaler)");

    const raw = await withRls(userId, (tx) => tx.medicalInfo.findUniqueOrThrow({ where: { id: createRes.body.id } }));
    expect(raw.condition).not.toContain("Asthma");
  });
});
