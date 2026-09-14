import crypto from "node:crypto";

import { config } from "../config";

// Post-launch backlog Phase G — app-level field encryption for MedicalInfo's
// free-text columns (condition/description/emergencyNote), per the user's
// explicit choice over relying on disk-level encryption (works regardless
// of hosting, no cloud-vendor lock-in). AES-256-GCM: authenticated
// encryption, so a tampered ciphertext fails to decrypt rather than
// silently returning garbage.
//
// config.medicalInfoEncryptionKey is an arbitrary-length string (same
// "openssl rand -hex 32, but any string works" shape as SESSION_SECRET) —
// SHA-256 derives a real 32-byte key from it once, at module load.
const KEY = crypto.createHash("sha256").update(config.medicalInfoEncryptionKey).digest();
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM's recommended nonce size

// Encoded as iv:authTag:ciphertext, each base64 — a single string, so the
// existing String/String? MedicalInfo columns need no schema change at all.
export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptField(encoded: string): string {
  const [ivB64, tagB64, ctB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error("Malformed encrypted field — expected iv:authTag:ciphertext");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

// Nullable-field convenience — MedicalInfo.description/emergencyNote are
// both optional; condition is always required (use encryptField/
// decryptField directly for that one).
export function encryptNullableField(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  return encryptField(value);
}

export function decryptNullableField(value: string | null): string | null {
  if (value === null) return null;
  return decryptField(value);
}
