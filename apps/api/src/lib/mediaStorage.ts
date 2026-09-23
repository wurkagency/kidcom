// Storage interface for media originals/derivatives — see docs/plesk_deployment.md's
// "Media storage" note: local disk for now, swappable for S3-compatible
// object storage later without touching calling code (routes/worker only
// ever go through this interface, never `fs` directly).
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { config } from "../config";

export interface MediaStorage {
  // Returns the storage key the file was saved under.
  save(key: string, data: Buffer | NodeJS.ReadableStream): Promise<string>;
  // Absolute filesystem path for a key — used by sharp/ffmpeg, which need a
  // real path to read from/write to rather than a stream.
  pathFor(key: string): string;
  // Creates the parent directory for a key (e.g. "derived/") if it doesn't
  // exist yet, without touching the file itself. sharp's .toFile() and
  // ffmpeg's .screenshots() both write straight to a path and do NOT create
  // missing parent directories — unlike save() above, which already does
  // this mkdir for uploaded originals. Callers that hand sharp/ffmpeg a
  // pathFor() result directly (worker.ts's processImage/processVideo) must
  // call this first.
  ensureDirFor(key: string): Promise<void>;
  readStream(key: string): NodeJS.ReadableStream;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export class LocalDiskStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  pathFor(key: string): string {
    return path.join(this.root, key);
  }

  async ensureDirFor(key: string): Promise<void> {
    await fsp.mkdir(path.dirname(this.pathFor(key)), { recursive: true });
  }

  async save(key: string, data: Buffer | NodeJS.ReadableStream): Promise<string> {
    const dest = this.pathFor(key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    if (Buffer.isBuffer(data)) {
      await fsp.writeFile(dest, data);
    } else {
      await new Promise<void>((resolve, reject) => {
        const out = fs.createWriteStream(dest);
        data.pipe(out);
        out.on("finish", () => resolve());
        out.on("error", reject);
        data.on("error", reject);
      });
    }
    return key;
  }

  readStream(key: string): NodeJS.ReadableStream {
    return fs.createReadStream(this.pathFor(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsp.access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await fsp.rm(this.pathFor(key), { force: true });
  }
}

export const mediaStorage: MediaStorage = new LocalDiskStorage(config.mediaStoragePath);
