import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";

// At-rest encryption for every media file (photos, videos, derivatives).
//
// Each file has its own random 256-bit data key, wrapped (AES-256-GCM) with
// the master key from MEDIA_ENCRYPTION_KEY and stored in the file's header,
// so no database lookup is needed to read a file. The content is encrypted
// in fixed-size chunks, each its own AES-256-GCM message, so a byte range
// (video seeking) decrypts only the chunks it touches.
//
// File layout (header is HEADER_BYTES long):
//   "KCM1" magic                     4
//   version (1)                      1
//   chunk size (u32 BE)              4
//   nonce prefix                     8   ─┐ the "content header": every
//   plaintext size (u64 BE)          8   ─┘ chunk authenticates these (AAD)
//   master key id                    8   ─┐ the "key wrap": rewritten in
//   wrap IV                         12    │ place on key rotation, so it is
//   wrap tag                        16    │ deliberately NOT part of the AAD
//   wrapped data key                32   ─┘
//   then chunks: ciphertext (≤ chunk size) + 16-byte tag each.
// Chunk nonce = nonce prefix ‖ chunk index (u32 BE), so chunks can't be
// reordered; the plaintext size in the AAD makes truncation detectable.

const MAGIC = Buffer.from("KCM1");
const VERSION = 1;
export const CHUNK_SIZE = 64 * 1024;
const TAG = 16;
const CONTENT_HEADER = 4 + 1 + 4 + 8 + 8; // 25
const WRAP_OFFSET = CONTENT_HEADER;
const WRAP_BYTES = 8 + 12 + 16 + 32; // 68
export const HEADER_BYTES = CONTENT_HEADER + WRAP_BYTES; // 93

export type MasterKeys = {
  /** Encrypts new files; tried first when reading. */
  current: Buffer;
  /** Older keys still accepted when reading (during a rotation). */
  previous: Buffer[];
};

/** "openssl rand -hex 32" → 32 bytes. */
export function parseMasterKey(hex: string, name: string): Buffer {
  const key = Buffer.from(hex.trim(), "hex");
  if (key.length !== 32 || key.toString("hex") !== hex.trim().toLowerCase()) {
    throw new Error(`${name} must be 64 hex characters (openssl rand -hex 32)`);
  }
  return key;
}

const keyId = (key: Buffer) => crypto.createHash("sha256").update(key).digest().subarray(0, 8);

type Header = {
  chunkSize: number;
  noncePrefix: Buffer;
  plaintextSize: number;
  contentHeader: Buffer;
  dataKey: Buffer;
};

function wrap(dataKey: Buffer, master: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", master, iv);
  const wrapped = Buffer.concat([c.update(dataKey), c.final()]);
  return Buffer.concat([keyId(master), iv, c.getAuthTag(), wrapped]);
}

function unwrap(block: Buffer, keys: MasterKeys): Buffer {
  const id = block.subarray(0, 8);
  const master = [keys.current, ...keys.previous].find((k) => keyId(k).equals(id));
  if (!master) throw new MediaCryptoError("File was encrypted with a master key that isn't configured");
  const d = crypto.createDecipheriv("aes-256-gcm", master, block.subarray(8, 20));
  d.setAuthTag(block.subarray(20, 36));
  try {
    return Buffer.concat([d.update(block.subarray(36, 68)), d.final()]);
  } catch {
    throw new MediaCryptoError("Media key wrap failed authentication");
  }
}

export class MediaCryptoError extends Error {}

function contentHeader(chunkSize: number, noncePrefix: Buffer, plaintextSize: number): Buffer {
  const b = Buffer.alloc(CONTENT_HEADER);
  MAGIC.copy(b, 0);
  b.writeUInt8(VERSION, 4);
  b.writeUInt32BE(chunkSize, 5);
  noncePrefix.copy(b, 9);
  b.writeBigUInt64BE(BigInt(plaintextSize), 17);
  return b;
}

function parseHeader(buf: Buffer, keys: MasterKeys): Header {
  if (buf.length < HEADER_BYTES || !buf.subarray(0, 4).equals(MAGIC)) throw new MediaCryptoError("Not an encrypted media file");
  if (buf.readUInt8(4) !== VERSION) throw new MediaCryptoError("Unsupported media encryption version");
  return {
    chunkSize: buf.readUInt32BE(5),
    noncePrefix: buf.subarray(9, 17),
    plaintextSize: Number(buf.readBigUInt64BE(17)),
    contentHeader: buf.subarray(0, CONTENT_HEADER),
    dataKey: unwrap(buf.subarray(WRAP_OFFSET, HEADER_BYTES), keys),
  };
}

const nonce = (prefix: Buffer, index: number) => {
  const n = Buffer.alloc(12);
  prefix.copy(n, 0);
  n.writeUInt32BE(index, 8);
  return n;
};

function sealChunk(h: Pick<Header, "dataKey" | "noncePrefix" | "contentHeader">, index: number, plain: Buffer): Buffer {
  const c = crypto.createCipheriv("aes-256-gcm", h.dataKey, nonce(h.noncePrefix, index));
  c.setAAD(h.contentHeader);
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
}

function openChunk(h: Header, index: number, sealed: Buffer): Buffer {
  const d = crypto.createDecipheriv("aes-256-gcm", h.dataKey, nonce(h.noncePrefix, index));
  d.setAAD(h.contentHeader);
  d.setAuthTag(sealed.subarray(sealed.length - TAG));
  try {
    return Buffer.concat([d.update(sealed.subarray(0, sealed.length - TAG)), d.final()]);
  } catch {
    throw new MediaCryptoError(`Media chunk ${index} failed authentication (tampered or truncated)`);
  }
}

const chunkCount = (size: number, chunkSize: number) => Math.max(1, Math.ceil(size / chunkSize));
/** Where chunk i starts in the file, and how long it is on disk. */
const chunkSpan = (h: Pick<Header, "chunkSize" | "plaintextSize">, i: number) => {
  const plain = Math.min(h.chunkSize, h.plaintextSize - i * h.chunkSize);
  return { offset: HEADER_BYTES + i * (h.chunkSize + TAG), length: Math.max(0, plain) + TAG };
};

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Encrypts a buffer into the file format. */
export function encryptBuffer(plain: Buffer, keys: MasterKeys, chunkSize = CHUNK_SIZE): Buffer {
  const dataKey = crypto.randomBytes(32);
  const noncePrefix = crypto.randomBytes(8);
  const ch = contentHeader(chunkSize, noncePrefix, plain.length);
  const parts = [ch, wrap(dataKey, keys.current)];
  const h = { dataKey, noncePrefix, contentHeader: ch };
  const n = chunkCount(plain.length, chunkSize);
  for (let i = 0; i < n; i++) parts.push(sealChunk(h, i, plain.subarray(i * chunkSize, (i + 1) * chunkSize)));
  return Buffer.concat(parts);
}

/** Encrypts a plaintext file to `dest`, streaming chunk by chunk (videos can be large). */
export async function encryptFile(src: string, dest: string, keys: MasterKeys, chunkSize = CHUNK_SIZE): Promise<void> {
  const { size } = await fsp.stat(src);
  const dataKey = crypto.randomBytes(32);
  const noncePrefix = crypto.randomBytes(8);
  const ch = contentHeader(chunkSize, noncePrefix, size);
  const h = { dataKey, noncePrefix, contentHeader: ch };
  const input = await fsp.open(src, "r");
  const output = await fsp.open(dest, "w", 0o600);
  try {
    await output.write(Buffer.concat([ch, wrap(dataKey, keys.current)]));
    const buf = Buffer.alloc(chunkSize);
    const n = chunkCount(size, chunkSize);
    for (let i = 0; i < n; i++) {
      const { bytesRead } = await input.read(buf, 0, chunkSize, i * chunkSize);
      await output.write(sealChunk(h, i, buf.subarray(0, bytesRead)));
    }
  } finally {
    await input.close();
    await output.close();
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

async function readHeader(path: string, keys: MasterKeys): Promise<Header> {
  const fh = await fsp.open(path, "r");
  try {
    const buf = Buffer.alloc(HEADER_BYTES);
    await fh.read(buf, 0, HEADER_BYTES, 0);
    return parseHeader(buf, keys);
  } finally {
    await fh.close();
  }
}

/** True when the file starts with the encrypted-media magic. */
export async function isEncryptedFile(path: string): Promise<boolean> {
  const fh = await fsp.open(path, "r");
  try {
    const buf = Buffer.alloc(4);
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    return bytesRead === 4 && buf.equals(MAGIC);
  } finally {
    await fh.close();
  }
}

export async function plaintextSize(path: string, keys: MasterKeys): Promise<number> {
  return (await readHeader(path, keys)).plaintextSize;
}

/**
 * Plaintext bytes [start, end] (inclusive, like HTTP ranges) as a stream.
 * Only the chunks covering the range are read and decrypted.
 */
export async function createDecryptStream(path: string, keys: MasterKeys, range?: { start: number; end: number }): Promise<Readable> {
  const h = await readHeader(path, keys);
  const start = range?.start ?? 0;
  const end = range?.end ?? h.plaintextSize - 1;
  if (h.plaintextSize === 0 || end < start) return Readable.from([]);
  const first = Math.floor(start / h.chunkSize);
  const last = Math.floor(end / h.chunkSize);
  const fh = await fsp.open(path, "r");

  async function* chunks() {
    try {
      for (let i = first; i <= last; i++) {
        const { offset, length } = chunkSpan(h, i);
        const sealed = Buffer.alloc(length);
        const { bytesRead } = await fh.read(sealed, 0, length, offset);
        if (bytesRead !== length) throw new MediaCryptoError(`Media file truncated at chunk ${i}`);
        const plain = openChunk(h, i, sealed);
        const from = i === first ? start - i * h.chunkSize : 0;
        const to = i === last ? end - i * h.chunkSize + 1 : plain.length;
        yield plain.subarray(from, to);
      }
    } finally {
      await fh.close();
    }
  }
  return Readable.from(chunks());
}

/** Decrypts a whole file to `dest` (for sharp / ffmpeg, which need a real path). */
export async function decryptFile(src: string, dest: string, keys: MasterKeys): Promise<void> {
  const input = await createDecryptStream(src, keys);
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(dest, { mode: 0o600 });
    input.on("error", reject);
    out.on("error", reject);
    out.on("finish", () => resolve());
    input.pipe(out);
  });
}

/** Re-wraps a file's data key under the current master key, in place (key rotation). */
export async function rewrapFile(path: string, keys: MasterKeys): Promise<boolean> {
  const h = await readHeader(path, keys);
  const fh = await fsp.open(path, "r+");
  try {
    const current = Buffer.alloc(8);
    await fh.read(current, 0, 8, WRAP_OFFSET);
    if (current.equals(keyId(keys.current))) return false;
    await fh.write(wrap(h.dataKey, keys.current), 0, WRAP_BYTES, WRAP_OFFSET);
    return true;
  } finally {
    await fh.close();
  }
}
