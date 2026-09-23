import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const here = dirname(fileURLToPath(import.meta.url));
export const DESIGN_DIR = resolve(here, "../../../../docs/design/aura");
const DIFF_DIR = resolve(here, "../.results/design-diffs");

/** A band of the screen in reference-image pixels (the Stitch PNGs are 1.5x). */
export type Region = { name: string; x: number; y: number; width: number; height: number };

function crop(png: PNG, r: Region): PNG {
  const out = new PNG({ width: r.width, height: r.height });
  PNG.bitblt(png, out, r.x, r.y, r.width, r.height, 0, 0);
  return out;
}

export function loadReference(screenFolder: string): PNG {
  return PNG.sync.read(readFileSync(join(DESIGN_DIR, screenFolder, "screen.png")));
}

/**
 * Diffs `region` of a screenshot against the same region of the Stitch
 * reference. Returns the share of mismatching pixels (0–1) and writes
 * reference | actual | diff side by side for review.
 */
export function compareRegion(actualBuffer: Buffer, screenFolder: string, region: Region): number {
  const reference = crop(loadReference(screenFolder), region);
  const actual = crop(PNG.sync.read(actualBuffer), region);
  const diff = new PNG({ width: region.width, height: region.height });
  const mismatched = pixelmatch(reference.data, actual.data, diff.data, region.width, region.height, {
    threshold: 0.15,
    includeAA: false,
  });

  const sheet = new PNG({ width: region.width * 3, height: region.height });
  PNG.bitblt(reference, sheet, 0, 0, region.width, region.height, 0, 0);
  PNG.bitblt(actual, sheet, 0, 0, region.width, region.height, region.width, 0);
  PNG.bitblt(diff, sheet, 0, 0, region.width, region.height, region.width * 2, 0);
  mkdirSync(DIFF_DIR, { recursive: true });
  writeFileSync(join(DIFF_DIR, `${screenFolder}--${region.name}.png`), PNG.sync.write(sheet));

  return mismatched / (region.width * region.height);
}

/** Crops a region of a Stitch reference into a PNG buffer (used as fixture imagery). */
export function cropReference(screenFolder: string, region: Region): Buffer {
  return PNG.sync.write(crop(loadReference(screenFolder), region));
}
