// Medical-info key rotation (see docs/deployment_guide.md → "Rotating the
// medical-info key"). Run with the API's environment, e.g.
//
//   npm run medical:rekey --workspace=apps/api                # re-encrypt with the current key
//   npm run medical:rekey --workspace=apps/api -- --dry-run   # only report
//
// Needs the new key in MEDICAL_INFO_ENCRYPTION_KEY and the old one(s) in
// MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS. Safe to re-run; when it reports
// 0 re-encrypted and 0 unreadable, remove the old key.
/* eslint-disable no-console */
import { prisma } from "../db";
import { rekeyMedicalInfo } from "../lib/medicalRekey";

const dryRun = process.argv.includes("--dry-run");

rekeyMedicalInfo({ dryRun })
  .then(({ rows, reencrypted, unreadable }) => {
    console.log(`${dryRun ? "[dry run] " : ""}medical info: ${rows} row(s), ${reencrypted} value(s) ${dryRun ? "to re-encrypt" : "re-encrypted"}, ${unreadable} unreadable`);
    if (unreadable > 0) {
      console.log("Unreadable values: their key is in neither MEDICAL_INFO_ENCRYPTION_KEY nor MEDICAL_INFO_ENCRYPTION_KEYS_PREVIOUS.");
      process.exitCode = 1;
    }
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
