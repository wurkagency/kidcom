import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import ffmpeg, { type FfprobeData } from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

import { mediaStorage } from "./mediaStorage";
import { EMPTY_CAPTURE, hasLocation, readImageCapture, stripJpegLocation, videoCaptureFromTags, type CaptureInfo } from "./mediaMetadata";

// What the worker does with a fresh upload (worker.ts only schedules it).
// Every file is encrypted at rest, so each step works on a short-lived
// plaintext scratch copy and hands its output back to mediaStorage, which
// encrypts it:
//   photo: capture metadata → location-free copy (if it had one) → WebP
//   video: probe (size, length, codec, capture metadata) → poster frame →
//          H.264/AAC MP4 (plays everywhere; iPhones record HEVC) → location-
//          free copy of the original (if it had one)

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
// ffmpeg-static only ships ffmpeg; ffprobe-static ships the ffprobe that
// fluent-ffmpeg's ffprobe() needs (a bare host rarely has it on PATH).
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path);

export type ProcessedMedia = {
  derivedPath: string;
  derivedBytes: number;
  playablePath?: string;
  playableBytes?: number;
  width: number | null;
  height: number | null;
  durationSeconds?: number | null;
  codec?: string | null;
  capture: CaptureInfo;
  sharedOriginalPath: string | null;
  sharedOriginalBytes: number | null;
};

/** Runs `fn` with scratch paths, removing them afterwards whatever happens. */
async function withScratch<T>(exts: string[], fn: (paths: string[]) => Promise<T>): Promise<T> {
  const paths = await Promise.all(exts.map((e) => mediaStorage.scratchPath(e)));
  try {
    return await fn(paths);
  } finally {
    await Promise.all(paths.map((p) => fsp.rm(p, { force: true })));
  }
}

const extOf = (key: string) => path.extname(key).replace(/^\./, "").toLowerCase();

export async function processImage(asset: { id: string; originalPath: string }): Promise<ProcessedMedia> {
  const derivedKey = `derived/${asset.id}.webp`;
  return mediaStorage.withPlainCopy(asset.originalPath, async (plain) => {
    const capture = await readImageCapture(plain);

    let sharedOriginalPath: string | null = null;
    let sharedOriginalBytes: number | null = null;
    if (hasLocation(capture)) {
      const stripped = ["jpg", "jpeg"].includes(extOf(asset.originalPath)) ? stripJpegLocation(await fsp.readFile(plain)) : null;
      if (stripped) {
        sharedOriginalPath = `original/${asset.id}-shared.${extOf(asset.originalPath)}`;
        await withScratch([extOf(asset.originalPath)], async ([tmp]) => {
          await fsp.writeFile(tmp!, stripped, { mode: 0o600 });
          sharedOriginalBytes = await mediaStorage.saveFile(sharedOriginalPath!, tmp!);
        });
      }
      // No lossless strip for this format: others get the WebP instead
      // (routes/media downloadKey), never the located original.
    }

    const metadata = await sharp(plain).rotate().metadata();
    return withScratch(["webp"], async ([out]) => {
      // sharp writes no EXIF/XMP unless asked: the WebP carries no location.
      await sharp(plain).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toFile(out!);
      const derivedBytes = await mediaStorage.saveFile(derivedKey, out!);
      // .rotate() applies the EXIF orientation, so report upright dimensions.
      const swap = (metadata.orientation ?? 1) >= 5;
      return {
        derivedPath: derivedKey,
        derivedBytes,
        width: (swap ? metadata.height : metadata.width) ?? null,
        height: (swap ? metadata.width : metadata.height) ?? null,
        capture,
        sharedOriginalPath,
        sharedOriginalBytes,
      };
    });
  });
}

const probe = (file: string) =>
  new Promise<FfprobeData>((resolve, reject) => ffmpeg.ffprobe(file, (err, data) => (err ? reject(err) : resolve(data))));

const run = (command: ffmpeg.FfmpegCommand) =>
  new Promise<void>((resolve, reject) => {
    command.on("end", () => resolve()).on("error", reject);
  });

export async function processVideo(asset: { id: string; originalPath: string }): Promise<ProcessedMedia> {
  const derivedKey = `derived/${asset.id}.jpg`; // poster frame — the feed/gallery thumbnail
  const playableKey = `derived/${asset.id}-playable.mp4`;
  const ext = extOf(asset.originalPath) || "mp4";

  return mediaStorage.withPlainCopy(asset.originalPath, async (plain) => {
    const data = await probe(plain);
    const video = data.streams.find((s) => s.codec_type === "video" && s.width && s.height);
    const duration = Number(data.format?.duration ?? video?.duration);
    const tags = { ...(data.format?.tags ?? {}), ...(video?.tags ?? {}) } as Record<string, unknown>;
    const capture = data.format?.tags ? videoCaptureFromTags(tags) : EMPTY_CAPTURE;
    // Phones record portrait video as landscape pixels + a rotation flag.
    const rotation = Math.abs(Number((video?.tags as Record<string, unknown> | undefined)?.rotate ?? video?.side_data_list?.find((d: Record<string, unknown>) => "rotation" in d)?.rotation ?? 0));
    const swap = rotation === 90 || rotation === 270;

    return withScratch(["jpg", "mp4", ext], async ([poster, playable, shared]) => {
      await run(
        ffmpeg(plain).screenshots({ count: 1, folder: path.dirname(poster!), filename: path.basename(poster!), timestamps: [duration > 1 ? "1" : "0"] }),
      );
      // H.264 baseline + AAC in MP4 plays in every mainstream browser;
      // +faststart lets playback begin before the file has arrived.
      // -map_metadata -1: the playback copy carries no location/device tags.
      await run(
        ffmpeg(plain)
          .videoCodec("libx264")
          .audioCodec("aac")
          .outputOptions(["-profile:v baseline", "-level 3.0", "-pix_fmt yuv420p", "-movflags +faststart", "-map_metadata -1"])
          .save(playable!),
      );

      let sharedOriginalPath: string | null = null;
      let sharedOriginalBytes: number | null = null;
      if (hasLocation(capture)) {
        try {
          // Lossless: streams copied as-is, container metadata dropped.
          await run(ffmpeg(plain).outputOptions(["-map 0", "-c copy", "-map_metadata -1", "-map_chapters -1"]).save(shared!));
          sharedOriginalPath = `original/${asset.id}-shared.${ext}`;
          sharedOriginalBytes = await mediaStorage.saveFile(sharedOriginalPath, shared!);
        } catch {
          // Couldn't remux (unusual track types): others get the playable
          // copy instead of the located original (routes/media downloadKey).
        }
      }

      const derivedBytes = await mediaStorage.saveFile(derivedKey, poster!);
      const playableBytes = await mediaStorage.saveFile(playableKey, playable!);
      return {
        derivedPath: derivedKey,
        derivedBytes,
        playablePath: playableKey,
        playableBytes,
        width: (swap ? video?.height : video?.width) ?? null,
        height: (swap ? video?.width : video?.height) ?? null,
        durationSeconds: Number.isFinite(duration) ? duration : null,
        codec: video?.codec_name ?? null,
        capture,
        sharedOriginalPath,
        sharedOriginalBytes,
      };
    });
  });
}

/** The columns to write once an asset has been processed. */
export function processedColumns(r: ProcessedMedia) {
  return {
    status: "READY" as const,
    derivedPath: r.derivedPath,
    derivedBytes: r.derivedBytes,
    playablePath: r.playablePath,
    playableBytes: r.playableBytes,
    width: r.width,
    height: r.height,
    durationSeconds: r.durationSeconds,
    codec: r.codec,
    capturedLatitude: r.capture.latitude,
    capturedLongitude: r.capture.longitude,
    capturedAltitude: r.capture.altitude,
    capturedAt: r.capture.capturedAt,
    deviceMake: r.capture.deviceMake,
    deviceModel: r.capture.deviceModel,
    sharedOriginalPath: r.sharedOriginalPath,
    sharedOriginalBytes: r.sharedOriginalBytes,
  };
}
