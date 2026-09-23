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

/**
 * Diffs a full-page screenshot against a Stitch reference image of the same
 * width. Heights can differ slightly (real content vs mock copy), so the
 * overlapping top portion is compared and the height delta reported.
 */
export function comparePage(
  actualBuffer: Buffer,
  referenceBuffer: Buffer,
  name: string,
  /**
   * A deliberate change that shifts everything below it, in reference pixels
   * from row `atY`: `by` > 0 means the app is shorter there (rows removed
   * from the reference), `by` < 0 taller (rows removed from the screenshot).
   * Documented at each call site.
   */
  shift?: { atY: number; by: number },
) {
  let reference = PNG.sync.read(referenceBuffer);
  let actual = PNG.sync.read(actualBuffer);
  const cut = (png: PNG, atY: number, rows: number) => {
    const out = new PNG({ width: png.width, height: png.height - rows });
    PNG.bitblt(png, out, 0, 0, png.width, atY, 0, 0);
    PNG.bitblt(png, out, 0, atY + rows, png.width, png.height - atY - rows, 0, atY);
    return out;
  };
  if (shift && shift.by > 0) reference = cut(reference, shift.atY, shift.by);
  if (shift && shift.by < 0) actual = cut(actual, shift.atY, -shift.by);
  const width = Math.min(reference.width, actual.width);
  const height = Math.min(reference.height, actual.height);
  const region = { name, x: 0, y: 0, width, height };
  const ref = crop(reference, region);
  const act = crop(actual, region);
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(ref.data, act.data, diff.data, width, height, { threshold: 0.15, includeAA: false });

  const sheet = new PNG({ width: width * 3, height });
  PNG.bitblt(ref, sheet, 0, 0, width, height, 0, 0);
  PNG.bitblt(act, sheet, 0, 0, width, height, width, 0);
  PNG.bitblt(diff, sheet, 0, 0, width, height, width * 2, 0);
  mkdirSync(DIFF_DIR, { recursive: true });
  writeFileSync(join(DIFF_DIR, `${name}.png`), PNG.sync.write(sheet));

  return { mismatch: mismatched / (width * height), heightDelta: actual.height - reference.height };
}

export function referencePng(screenFolder: string): Buffer {
  return readFileSync(join(DESIGN_DIR, screenFolder, "screen.png"));
}

export function referenceHtml(screenFolder: string): string {
  return join(DESIGN_DIR, screenFolder, "code.html");
}
