import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

import {
  createDecryptStream,
  encryptBuffer,
  encryptFile,
  HEADER_BYTES,
  isEncryptedFile,
  MediaCryptoError,
  plaintextSize,
  rewrapFile,
  type MasterKeys,
} from "./mediaCrypto";

// The at-rest media format: whole-file and ranged reads, tamper and
// truncation detection, and key rotation. Small chunks keep multi-chunk
// cases fast.

const CHUNK = 1024;
const keyA = crypto.randomBytes(32);
const keyB = crypto.randomBytes(32);
const keys: MasterKeys = { current: keyA, previous: [] };
let dir: string;

beforeAll(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "kidcom-crypto-"));
});

const read = async (s: Readable) => {
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(Buffer.from(c as Buffer));
  return Buffer.concat(parts);
};

async function stored(plain: Buffer, k: MasterKeys = keys) {
  const file = path.join(dir, crypto.randomUUID());
  await fsp.writeFile(file, encryptBuffer(plain, k, CHUNK));
  return file;
}

describe("media encryption", () => {
  it.each([0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 5 * CHUNK + 17])("round-trips %i bytes", async (n) => {
    const plain = crypto.randomBytes(n);
    const file = await stored(plain);
    expect(await isEncryptedFile(file)).toBe(true);
    expect(await plaintextSize(file, keys)).toBe(n);
    expect((await read(await createDecryptStream(file, keys))).equals(plain)).toBe(true);
    // No plaintext on disk
    if (n > 16) expect((await fsp.readFile(file)).includes(plain.subarray(0, 16))).toBe(false);
  });

  it("reads byte ranges inside one chunk and across several", async () => {
    const plain = crypto.randomBytes(6 * CHUNK + 300);
    const file = await stored(plain);
    for (const [start, end] of [
      [0, 0],
      [10, 20],
      [CHUNK - 5, CHUNK + 5],
      [CHUNK * 2, CHUNK * 4 - 1],
      [100, plain.length - 1],
      [plain.length - 1, plain.length - 1],
    ] as const) {
      const got = await read(await createDecryptStream(file, keys, { start, end }));
      expect(got.equals(plain.subarray(start, end + 1))).toBe(true);
    }
  });

  it("encrypts a file on disk the same way (streamed)", async () => {
    const plain = crypto.randomBytes(3 * CHUNK + 5);
    const src = path.join(dir, "plain.bin");
    const dest = path.join(dir, "enc.bin");
    await fsp.writeFile(src, plain);
    await encryptFile(src, dest, keys, CHUNK);
    expect((await read(await createDecryptStream(dest, keys))).equals(plain)).toBe(true);
    expect(await isEncryptedFile(src)).toBe(false);
  });

  it("detects a flipped byte, a truncated file and a changed size", async () => {
    const plain = crypto.randomBytes(3 * CHUNK);
    const flipped = await stored(plain);
    const buf = await fsp.readFile(flipped);
    buf[HEADER_BYTES + CHUNK + 40]! ^= 0x01;
    await fsp.writeFile(flipped, buf);
    await expect(read(await createDecryptStream(flipped, keys))).rejects.toThrow(MediaCryptoError);

    const truncated = await stored(plain);
    const whole = await fsp.readFile(truncated);
    await fsp.writeFile(truncated, whole.subarray(0, whole.length - 100));
    await expect(read(await createDecryptStream(truncated, keys))).rejects.toThrow(/truncated/);

    // Claim a smaller plaintext size: the header is authenticated by every chunk.
    const resized = await stored(plain);
    const h = await fsp.readFile(resized);
    h.writeBigUInt64BE(BigInt(CHUNK), 17);
    await fsp.writeFile(resized, h);
    await expect(read(await createDecryptStream(resized, keys))).rejects.toThrow(MediaCryptoError);
  });

  it("needs the right master key, and a rotation only rewrites the header", async () => {
    const plain = crypto.randomBytes(2 * CHUNK + 9);
    const file = await stored(plain, { current: keyA, previous: [] });
    await expect(createDecryptStream(file, { current: keyB, previous: [] })).rejects.toThrow(/master key/);

    const rotating: MasterKeys = { current: keyB, previous: [keyA] };
    const before = await fsp.readFile(file);
    expect(await rewrapFile(file, rotating)).toBe(true);
    expect(await rewrapFile(file, rotating)).toBe(false); // already current
    const after = await fsp.readFile(file);
    expect(after.subarray(HEADER_BYTES).equals(before.subarray(HEADER_BYTES))).toBe(true);
    // Readable with the new key alone once rotated.
    expect((await read(await createDecryptStream(file, { current: keyB, previous: [] }))).equals(plain)).toBe(true);
  });
});
