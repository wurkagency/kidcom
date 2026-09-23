import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";

import { mediaStorage } from "./mediaStorage";
import { parseIso6709, readImageCapture, stripJpegLocation, videoCaptureFromTags } from "./mediaMetadata";
import { processImage, processVideo } from "./mediaProcessing";

// Capture metadata, lossless location removal and the encrypted processing
// pipeline, on real files generated here.

const read = async (key: string) => {
  const parts: Buffer[] = [];
  for await (const c of await mediaStorage.readStream(key)) parts.push(Buffer.from(c as Buffer));
  return Buffer.concat(parts);
};

/** A JPEG taken in Copenhagen by an "iPhone 15 Pro". */
function locatedJpeg() {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 120, g: 180, b: 160 } } })
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: { Make: "Apple", Model: "iPhone 15 Pro" },
      IFD2: { DateTimeOriginal: "2026:10:10 14:20:00" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "55/1 40/1 3396/100", GPSLongitudeRef: "E", GPSLongitude: "12/1 34/1 5988/100" },
    })
    .toBuffer();
}

async function scratchFile(ext: string, data?: Buffer) {
  const p = await mediaStorage.scratchPath(ext);
  if (data) await fsp.writeFile(p, data);
  return p;
}

describe("capture metadata", () => {
  it("parses ISO 6709 locations (QuickTime / Android)", () => {
    expect(parseIso6709("+55.6761+012.5683+010.000/")).toEqual({ latitude: 55.6761, longitude: 12.5683, altitude: 10 });
    expect(parseIso6709("-33.8688+151.2093/")).toEqual({ latitude: -33.8688, longitude: 151.2093, altitude: null });
    expect(parseIso6709("nonsense")).toBeNull();
    expect(
      videoCaptureFromTags({ "com.apple.quicktime.location.ISO6709": "+55.6761+012.5683/", "com.apple.quicktime.model": "iPhone 15 Pro", creation_time: "2026-10-10T12:20:00.000000Z" }),
    ).toMatchObject({ latitude: 55.6761, longitude: 12.5683, deviceModel: "iPhone 15 Pro" });
  });

  it("reads a photo's location and device, and removes the location without touching the pixels", async () => {
    const jpeg = await locatedJpeg();
    const file = await scratchFile("jpg", jpeg);
    const capture = await readImageCapture(file);
    expect(capture.latitude).toBeCloseTo(55.6761, 3);
    expect(capture.longitude).toBeCloseTo(12.5833, 3);
    expect(capture).toMatchObject({ deviceMake: "Apple", deviceModel: "iPhone 15 Pro" });

    const stripped = stripJpegLocation(jpeg)!;
    const strippedFile = await scratchFile("jpg", stripped);
    expect(await readImageCapture(strippedFile)).toMatchObject({ latitude: null, longitude: null, deviceModel: "iPhone 15 Pro" });
    expect(stripped.length).toBe(jpeg.length); // zeroed in place: nothing re-encoded
    const [a, b] = await Promise.all([sharp(jpeg).raw().toBuffer(), sharp(stripped).raw().toBuffer()]);
    expect(a.equals(b)).toBe(true);
    await Promise.all([fsp.rm(file), fsp.rm(strippedFile)]);
  });

  it("leaves non-JPEGs to the caller", () => {
    expect(stripJpegLocation(Buffer.from("not a jpeg"))).toBeNull();
  });
});

describe("processing (encrypted at rest)", () => {
  it("photo: records capture data, stores a location-free copy for others and a WebP", async () => {
    const id = crypto.randomUUID();
    const originalPath = `original/${id}.jpg`;
    await mediaStorage.save(originalPath, await locatedJpeg());

    const r = await processImage({ id, originalPath });
    expect(r.capture.latitude).toBeCloseTo(55.6761, 3);
    expect(r).toMatchObject({ width: 64, height: 48, sharedOriginalPath: `original/${id}-shared.jpg` });

    const shared = await scratchFile("jpg", await read(r.sharedOriginalPath!));
    expect((await readImageCapture(shared)).latitude).toBeNull();
    const webp = await sharp(await read(r.derivedPath)).metadata();
    expect(webp.format).toBe("webp");
    expect(webp.exif).toBeUndefined();
    await fsp.rm(shared);
  });

  it("photo without a location: no second copy", async () => {
    const id = crypto.randomUUID();
    const originalPath = `original/${id}.jpg`;
    await mediaStorage.save(originalPath, await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).jpeg().toBuffer());
    const r = await processImage({ id, originalPath });
    expect(r.capture.latitude).toBeNull();
    expect(r.sharedOriginalPath).toBeNull();
  });

  it("video: reads the location tag, and neither the playback copy nor the shared copy carries it", async () => {
    const id = crypto.randomUUID();
    const src = await scratchFile("mp4");
    await new Promise<void>((resolve, reject) =>
      ffmpeg()
        .input("testsrc=size=160x90:rate=10:duration=2")
        .inputFormat("lavfi")
        .outputOptions(["-pix_fmt yuv420p", "-metadata location=+55.6761+012.5683/", "-metadata creation_time=2026-10-10T12:20:00Z"])
        .on("end", () => resolve())
        .on("error", reject)
        .save(src),
    );
    const originalPath = `original/${id}.mp4`;
    await mediaStorage.saveFile(originalPath, src);

    const r = await processVideo({ id, originalPath });
    expect(r).toMatchObject({ width: 160, height: 90, codec: "h264", sharedOriginalPath: `original/${id}-shared.mp4` });
    expect(r.capture).toMatchObject({ latitude: 55.6761, longitude: 12.5683 });
    expect(r.durationSeconds).toBeCloseTo(2, 0);

    for (const key of [r.sharedOriginalPath!, r.playablePath!]) {
      const copy = await scratchFile("mp4", await read(key));
      const tags = await new Promise<Record<string, unknown>>((resolve, reject) =>
        ffmpeg.ffprobe(copy, (err, data) => (err ? reject(err) : resolve((data.format.tags ?? {}) as Record<string, unknown>))),
      );
      expect(JSON.stringify(tags)).not.toMatch(/55\.67/);
      await fsp.rm(copy);
    }
    await fsp.rm(src);
  }, 60_000);
});
