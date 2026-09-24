import { medicalCipher, type FieldCipher } from "./medicalEncryption";
import { withRlsBypass } from "./rls";

// After a medical-info key rotation: re-encrypts every value still sealed
// under an earlier key (MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS) with the
// current one. Values already on the current key are left untouched, so it
// is safe to re-run; when it reports 0 re-encrypted and 0 unreadable, the
// old key can be removed.

export type RekeyResult = { rows: number; reencrypted: number; unreadable: number };

const FIELDS = ["condition", "description", "emergencyNote"] as const;

export async function rekeyMedicalInfo(options: { dryRun?: boolean; cipher?: FieldCipher } = {}): Promise<RekeyResult> {
  const cipher = options.cipher ?? medicalCipher;
  const rows = await withRlsBypass((tx) =>
    tx.medicalInfo.findMany({ select: { id: true, condition: true, description: true, emergencyNote: true } })
  );

  let reencrypted = 0;
  let unreadable = 0;
  for (const row of rows) {
    const update: Partial<Record<(typeof FIELDS)[number], string>> = {};
    for (const field of FIELDS) {
      const value = row[field];
      if (value === null) continue;
      let index: number;
      try {
        index = cipher.keyIndexOf(value);
      } catch {
        unreadable++;
        continue;
      }
      if (index === 0) continue;
      update[field] = cipher.encrypt(cipher.decrypt(value));
      reencrypted++;
    }
    if (!options.dryRun && Object.keys(update).length > 0) {
      await withRlsBypass((tx) => tx.medicalInfo.update({ where: { id: row.id }, data: update }));
    }
  }
  return { rows: rows.length, reencrypted, unreadable };
}
