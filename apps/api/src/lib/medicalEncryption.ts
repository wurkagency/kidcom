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
//
// Rotation: new values are always encrypted with the current key; values
// written under an earlier key (MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS) still
// decrypt — GCM's auth tag tells the keys apart — until `npm run
// medical:rekey` (lib/medicalRekey.ts) has re-encrypted them all.
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM's recommended nonce size

export type FieldCipher = {
  encrypt(plaintext: string): string;
  decrypt(encoded: string): string;
  /** Which key opens `encoded`: 0 = the current key, n = previous[n - 1]. Throws if none does. */
  keyIndexOf(encoded: string): number;
};

const deriveKey = (secret: string) => crypto.createHash("sha256").update(secret).digest();

function parts(encoded: string) {
  const [ivB64, tagB64, ctB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error("Malformed encrypted field — expected iv:authTag:ciphertext");
  }
  return { iv: Buffer.from(ivB64, "base64"), tag: Buffer.from(tagB64, "base64"), ct: Buffer.from(ctB64, "base64") };
}

export function createFieldCipher(current: string, previous: readonly string[] = []): FieldCipher {
  const keys = [current, ...previous].map(deriveKey);

  // Encoded as iv:authTag:ciphertext, each base64 — a single string, so the
  // existing String/String? MedicalInfo columns need no schema change at all.
  const encrypt = (plaintext: string) => {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, keys[0]!, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
  };

  const open = (encoded: string): { plaintext: string; index: number } => {
    const { iv, tag, ct } = parts(encoded);
    for (let index = 0; index < keys.length; index++) {
      try {
        const decipher = crypto.createDecipheriv(ALGORITHM, keys[index]!, iv);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
        return { plaintext, index };
      } catch {
        // Wrong key (or tampered) — try the next one.
      }
    }
    throw new Error("Encrypted field can't be opened with any configured medical-info key (tampered, or its key is missing)");
  };

  return {
    encrypt,
    decrypt: (encoded) => open(encoded).plaintext,
    keyIndexOf: (encoded) => open(encoded).index,
  };
}

/** The app's cipher: the configured key, plus earlier keys during a rotation. */
export const medicalCipher = createFieldCipher(config.medicalInfoEncryptionKey, config.medicalInfoEncryptionKeysPrevious);

export function encryptField(plaintext: string): string {
  return medicalCipher.encrypt(plaintext);
}

export function decryptField(encoded: string): string {
  return medicalCipher.decrypt(encoded);
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
