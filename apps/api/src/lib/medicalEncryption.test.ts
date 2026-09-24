import { describe, it, expect } from "vitest";

import { createFieldCipher, decryptField, decryptNullableField, encryptField, encryptNullableField } from "./medicalEncryption";

describe("medical key rotation", () => {
  const oldCipher = createFieldCipher("dev-only-medical-encryption-key-change-me");
  const rotated = createFieldCipher("a-new-random-key-from-openssl-rand-hex-32", ["dev-only-medical-encryption-key-change-me"]);

  it("still reads values sealed under a previous key, and knows which key opened them", () => {
    const old = oldCipher.encrypt("Peanut allergy");
    expect(rotated.decrypt(old)).toBe("Peanut allergy");
    expect(rotated.keyIndexOf(old)).toBe(1);
  });

  it("always encrypts with the current key", () => {
    const fresh = rotated.encrypt("Asthma");
    expect(rotated.keyIndexOf(fresh)).toBe(0);
    expect(() => oldCipher.decrypt(fresh)).toThrow();
  });

  it("a value under an unknown key can't be opened", () => {
    const stranger = createFieldCipher("someone-elses-key").encrypt("x");
    expect(() => rotated.decrypt(stranger)).toThrow(/can't be opened/);
  });
});

describe("medicalEncryption (post-launch backlog Phase G)", () => {
  it("round-trips a plaintext string through encrypt/decrypt", () => {
    const plaintext = "Severe peanut allergy — carries an EpiPen";
    const encrypted = encryptField(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptField(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV), even for the same plaintext", () => {
    const a = encryptField("Asthma");
    const b = encryptField("Asthma");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe("Asthma");
    expect(decryptField(b)).toBe("Asthma");
  });

  it("a tampered ciphertext fails to decrypt rather than silently returning garbage (GCM auth tag)", () => {
    const encrypted = encryptField("Lactose intolerant");
    const [iv, tag, ct] = encrypted.split(":");
    const tamperedCt = Buffer.from(ct, "base64");
    tamperedCt[0] ^= 0xff;
    const tampered = `${iv}:${tag}:${tamperedCt.toString("base64")}`;
    expect(() => decryptField(tampered)).toThrow();
  });

  it("nullable helpers pass null/undefined through untouched", () => {
    expect(encryptNullableField(null)).toBeNull();
    expect(encryptNullableField(undefined)).toBeUndefined();
    expect(decryptNullableField(null)).toBeNull();
  });
});
