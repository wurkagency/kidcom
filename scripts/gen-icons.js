// One-off script: rasterizes apps/web/public/logo.svg (a dark #1d1d1b mark
// on transparent) into the PWA icon set. Not part of the build — run once
// whenever the logo changes, per DEPLOYMENT.md/README notes.
const sharp = require("sharp");
const path = require("path");

const SRC = path.join(__dirname, "../apps/web/public/logo.svg");
const OUT_DIR = path.join(__dirname, "../apps/web/public/icons");

// Kinnd's own theme colors (apps/web/vite.config.ts PWA manifest) — used as
// the maskable icon's background since maskable icons can't rely on
// transparency (the OS crops to a shape and fills outside it with whatever
// is there).
const BG = "#f8faf4";

async function main() {
  // Plain icons: transparent background, logo mark padded to ~65% of the
  // canvas so it isn't edge-to-edge.
  for (const size of [192, 512]) {
    const markSize = Math.round(size * 0.65);
    const mark = await sharp(SRC).resize(markSize, markSize, { fit: "contain" }).toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: mark, gravity: "center" }])
      .png()
      .toFile(path.join(OUT_DIR, `icon-${size}.png`));
    console.log(`wrote icon-${size}.png`);
  }

  // Maskable: solid background fill, mark kept within the ~80% "safe zone"
  // maskable icons are guaranteed not to crop.
  const size = 512;
  const markSize = Math.round(size * 0.5);
  const mark = await sharp(SRC).resize(markSize, markSize, { fit: "contain" }).toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(path.join(OUT_DIR, "icon-maskable-512.png"));
  console.log("wrote icon-maskable-512.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
