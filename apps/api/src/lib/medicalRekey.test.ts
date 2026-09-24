import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../app";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { createFieldCipher } from "./medicalEncryption";
import { rekeyMedicalInfo } from "./medicalRekey";
import { withRlsBypass } from "./rls";

// A server that ran on a weak or missing MEDICAL_INFO_ENCRYPTION_KEY can move
// to a real key without losing a single medical note.

const OLD = "dev-only-medical-encryption-key-change-me";
const NEW = "f".repeat(64);

describe("medical:rekey", () => {
  beforeEach(resetDb);

  it("re-encrypts values under old keys, leaves current ones, and is safe to re-run", async () => {
    const app = createApp();
    const mom = await signupTestUser(app);
    const childId = (await mom.agent.post("/children").send({ firstName: "Leo", gender: "BOY", birthday: "2018-05-14", relationship: "MOTHER" })).body.id as string;

    const oldCipher = createFieldCipher(OLD);
    const rotated = createFieldCipher(NEW, [OLD]);
    const oldRow = await withRlsBypass((tx) =>
      tx.medicalInfo.create({ data: { childId, condition: oldCipher.encrypt("Peanut allergy"), description: null, emergencyNote: oldCipher.encrypt("EpiPen in bag") } })
    );
    const newRow = await withRlsBypass((tx) => tx.medicalInfo.create({ data: { childId, condition: rotated.encrypt("Asthma") } }));

    const dry = await rekeyMedicalInfo({ cipher: rotated, dryRun: true });
    expect(dry).toEqual({ rows: 2, reencrypted: 2, unreadable: 0 });
    const untouched = await withRlsBypass((tx) => tx.medicalInfo.findUniqueOrThrow({ where: { id: oldRow.id } }));
    expect(rotated.keyIndexOf(untouched.condition)).toBe(1); // dry run changed nothing

    expect(await rekeyMedicalInfo({ cipher: rotated })).toEqual({ rows: 2, reencrypted: 2, unreadable: 0 });
    const after = await withRlsBypass((tx) => tx.medicalInfo.findUniqueOrThrow({ where: { id: oldRow.id } }));
    expect(rotated.keyIndexOf(after.condition)).toBe(0);
    expect(rotated.decrypt(after.condition)).toBe("Peanut allergy");
    expect(rotated.decrypt(after.emergencyNote!)).toBe("EpiPen in bag");
    const same = await withRlsBypass((tx) => tx.medicalInfo.findUniqueOrThrow({ where: { id: newRow.id } }));
    expect(same.condition).toBe(newRow.condition); // already current: not rewritten

    // Done: the old key is no longer needed.
    expect(await rekeyMedicalInfo({ cipher: createFieldCipher(NEW) })).toEqual({ rows: 2, reencrypted: 0, unreadable: 0 });
  });

  it("reports values whose key is missing instead of destroying them", async () => {
    const app = createApp();
    const mom = await signupTestUser(app);
    const childId = (await mom.agent.post("/children").send({ firstName: "Ida", gender: "GIRL", birthday: "2020-01-01", relationship: "MOTHER" })).body.id as string;
    const lost = createFieldCipher("a-key-nobody-configured").encrypt("Diabetes");
    await withRlsBypass((tx) => tx.medicalInfo.create({ data: { childId, condition: lost } }));

    expect(await rekeyMedicalInfo({ cipher: createFieldCipher(NEW, [OLD]) })).toEqual({ rows: 1, reencrypted: 0, unreadable: 1 });
    const row = await withRlsBypass((tx) => tx.medicalInfo.findFirstOrThrow({ where: { childId } }));
    expect(row.condition).toBe(lost);
  });
});
