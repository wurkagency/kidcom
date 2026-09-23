// Media encryption maintenance (see docs/plesk_deployment.md → "Media
// encryption"). Run with the API's environment, e.g.
//
//   npm run media:encrypt --workspace=apps/api                # encrypt files still in plaintext
//   npm run media:encrypt --workspace=apps/api -- --dry-run   # only report
//   npm run media:encrypt --workspace=apps/api -- --rewrap    # after a key rotation
//   npm run media:encrypt --workspace=apps/api -- --reprocess # also backfill capture metadata
//
// --rewrap re-wraps every file's data key under the current
// MEDIA_ENCRYPTION_KEY (only the 93-byte header changes); keep the old key in
// MEDIA_ENCRYPTION_KEYS_PREVIOUS until it reports 0 files left.
// --reprocess re-runs the worker's processing for every ready asset, so
// uploads from before capture metadata existed get it (and a location-free
// copy for other viewers).
// Safe to re-run: files are rewritten atomically and already-done files skipped.
/* eslint-disable no-console */
import fsp from "node:fs/promises";

import { prisma } from "../db";
import { encryptFile, isEncryptedFile, rewrapFile } from "../lib/mediaCrypto";
import { masterKeys, mediaStorage } from "../lib/mediaStorage";
import { processImage, processVideo, processedColumns } from "../lib/mediaProcessing";
import { withRlsBypass } from "../lib/rls";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const rewrap = args.has("--rewrap");
const reprocess = args.has("--reprocess");

async function main() {
  const keys = masterKeys();
  const assets = await withRlsBypass((tx) =>
    tx.mediaAsset.findMany({
      select: { id: true, type: true, status: true, originalPath: true, derivedPath: true, playablePath: true, sharedOriginalPath: true },
    }),
  );
  const paths = [...new Set(assets.flatMap((a) => [a.originalPath, a.derivedPath, a.playablePath, a.sharedOriginalPath]).filter((p): p is string => Boolean(p)))];

  let encrypted = 0;
  let rewrapped = 0;
  let missing = 0;
  for (const key of paths) {
    const file = mediaStorage.pathFor(key);
    try {
      await fsp.access(file);
    } catch {
      missing++;
      continue;
    }
    if (!(await isEncryptedFile(file))) {
      encrypted++;
      if (!dryRun) {
        const tmp = `${file}.enc.part`;
        await encryptFile(file, tmp, keys);
        await fsp.rename(tmp, file);
      }
    } else if (rewrap) {
      if (dryRun) rewrapped++;
      else if (await rewrapFile(file, keys)) rewrapped++;
    }
  }
  console.log(`${paths.length} files: ${encrypted} ${dryRun ? "to encrypt" : "encrypted"}, ${rewrapped} ${dryRun ? "to check for re-wrap" : "re-wrapped"}, ${missing} missing on disk`);

  if (reprocess && !dryRun) {
    let done = 0;
    for (const a of assets.filter((x) => x.status === "READY")) {
      try {
        const result = a.type === "IMAGE" ? await processImage(a) : await processVideo(a);
        await withRlsBypass((tx) => tx.mediaAsset.update({ where: { id: a.id }, data: processedColumns(result) }));
        done++;
      } catch (err) {
        console.error(`Reprocessing ${a.id} failed:`, err);
      }
    }
    console.log(`${done} assets reprocessed`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
