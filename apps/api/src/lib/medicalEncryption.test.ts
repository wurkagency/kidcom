import { describe, it, expect } from "vitest";

import { decryptField, decryptNullableField, encryptField, encryptNullableField } from "./medicalEncryption";

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
