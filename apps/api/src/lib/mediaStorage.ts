// Media file storage — see docs/deployment_guide.md's "Media storage" note:
// local disk for now, swappable for S3-compatible object storage later
// without touching calling code (routes/worker only go through this
// interface, never `fs` directly).
//
// Every file is encrypted at rest (lib/mediaCrypto.ts): save* encrypts,
// read* decrypts, and tools that need a real plaintext file (sharp, ffmpeg)
// borrow a short-lived 0600 copy via withPlainCopy(). Files written before
// encryption was introduced are still read as plaintext until
// scripts/encryptMedia.ts has converted them.
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

import { config } from "../config";
import {
  createDecryptStream,
  decryptFile,
  encryptBuffer,
  encryptFile,
  isEncryptedFile,
  parseMasterKey,
  plaintextSize,
  type MasterKeys,
} from "./mediaCrypto";

export type ByteRange = { start: number; end: number };

export interface MediaStorage {
  /** Encrypts and stores bytes (an upload). Returns the key. */
  save(key: string, data: Buffer): Promise<string>;
  /** Encrypts and stores a plaintext file (a worker output). Returns its plaintext size. */
  saveFile(key: string, plainPath: string): Promise<number>;
  /** Plaintext bytes, optionally a byte range (inclusive). */
  readStream(key: string, range?: ByteRange): Promise<Readable>;
  /** Plaintext size in bytes. */
  size(key: string): Promise<number>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Runs `fn` with a temporary plaintext copy of the file, removed afterwards. */
  withPlainCopy<T>(key: string, fn: (plainPath: string) => Promise<T>): Promise<T>;
  /** A fresh path in the plaintext scratch area (0600 once written; caller removes it). */
  scratchPath(ext: string): Promise<string>;
}

export function masterKeys(): MasterKeys {
  return {
    current: parseMasterKey(config.mediaEncryptionKey, "MEDIA_ENCRYPTION_KEY"),
    previous: config.mediaEncryptionKeysPrevious.map((k, i) => parseMasterKey(k, `MEDIA_ENCRYPTION_KEYS_PREVIOUS[${i}]`)),
  };
}

export class EncryptedDiskStorage implements MediaStorage {
  private readonly root: string;
  private readonly scratch: string;

  constructor(
    root: string,
    private readonly keys: MasterKeys,
    scratch = path.join(os.tmpdir(), "kinnd-media"),
  ) {
    this.root = path.resolve(root);
    this.scratch = path.resolve(scratch);
  }

  /** Absolute path of the stored (encrypted) file — for maintenance scripts only. */
  pathFor(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Media key escapes the storage root: ${key}`);
    return full;
  }

  private async writeAtomically(key: string, write: (tmp: string) => Promise<void>) {
    const dest = this.pathFor(key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${crypto.randomUUID()}.part`;
    try {
      await write(tmp);
      await fsp.rename(tmp, dest);
    } finally {
      await fsp.rm(tmp, { force: true });
    }
  }

  async save(key: string, data: Buffer): Promise<string> {
    await this.writeAtomically(key, (tmp) => fsp.writeFile(tmp, encryptBuffer(data, this.keys), { mode: 0o600 }));
    return key;
  }

  async saveFile(key: string, plainPath: string): Promise<number> {
    await this.writeAtomically(key, (tmp) => encryptFile(plainPath, tmp, this.keys));
    return (await fsp.stat(plainPath)).size;
  }

  async readStream(key: string, range?: ByteRange): Promise<Readable> {
    const file = this.pathFor(key);
    if (await isEncryptedFile(file)) return createDecryptStream(file, this.keys, range);
    // Not converted yet (pre-encryption upload).
    return fs.createReadStream(file, range ? { start: range.start, end: range.end } : undefined);
  }

  async size(key: string): Promise<number> {
    const file = this.pathFor(key);
    return (await isEncryptedFile(file)) ? plaintextSize(file, this.keys) : (await fsp.stat(file)).size;
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

  async scratchPath(ext: string): Promise<string> {
    await fsp.mkdir(this.scratch, { recursive: true, mode: 0o700 });
    return path.join(this.scratch, `${crypto.randomUUID()}${ext ? `.${ext.replace(/^\./, "")}` : ""}`);
  }

  /** Removes plaintext scratch files older than `maxAgeMs` (left behind by a crash). */
  async cleanScratch(maxAgeMs = 60 * 60 * 1000): Promise<number> {
    let removed = 0;
    const entries = await fsp.readdir(this.scratch).catch(() => [] as string[]);
    for (const name of entries) {
      const file = path.join(this.scratch, name);
      const st = await fsp.stat(file).catch(() => null);
      if (st && Date.now() - st.mtimeMs > maxAgeMs) {
        await fsp.rm(file, { force: true });
        removed++;
      }
    }
    return removed;
  }

  async withPlainCopy<T>(key: string, fn: (plainPath: string) => Promise<T>): Promise<T> {
    const file = this.pathFor(key);
    if (!(await isEncryptedFile(file))) return fn(file);
    const plain = await this.scratchPath(path.extname(key));
    try {
      await decryptFile(file, plain, this.keys);
      return await fn(plain);
    } finally {
      await fsp.rm(plain, { force: true });
    }
  }
}

export const mediaStorage = new EncryptedDiskStorage(config.mediaStoragePath, masterKeys(), config.mediaTempPath);
