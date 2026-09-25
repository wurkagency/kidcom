import exifr from "exifr";

// Capture metadata (where / when / which device) read from uploads for
// manage.kinnd.eu's abuse and fraud checks, and lossless removal of the
// location from files handed to anyone but the uploader. Location is only
// ever as good as what the phone left in the file: mobile browsers often
// remove it before upload.

export type CaptureInfo = {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  capturedAt: Date | null;
  deviceMake: string | null;
  deviceModel: string | null;
};

export const EMPTY_CAPTURE: CaptureInfo = {
  latitude: null,
  longitude: null,
  altitude: null,
  capturedAt: null,
  deviceMake: null,
  deviceModel: null,
};

export const hasLocation = (c: CaptureInfo) => c.latitude !== null && c.longitude !== null;

const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : null);
const date = (v: unknown) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);

/** EXIF (JPEG, HEIC, PNG, WebP, TIFF) → capture info. Never throws. */
export async function readImageCapture(path: string): Promise<CaptureInfo> {
  try {
    const exif = (await exifr.parse(path, { gps: true, tiff: true, exif: true, xmp: true, reviveValues: true })) as Record<string, unknown> | undefined;
    if (!exif) return EMPTY_CAPTURE;
    const lat = finite(exif.latitude);
    const lng = finite(exif.longitude);
    return {
      latitude: lat !== null && lng !== null ? lat : null,
      longitude: lat !== null && lng !== null ? lng : null,
      altitude: finite(exif.GPSAltitude),
      capturedAt: date(exif.DateTimeOriginal) ?? date(exif.CreateDate),
      deviceMake: text(exif.Make),
      deviceModel: text(exif.Model),
    };
  } catch {
    return EMPTY_CAPTURE;
  }
}

/** ISO 6709 "+55.6761+012.5683+010.000/" (QuickTime / Android location tags). */
export function parseIso6709(value: string | undefined | null): { latitude: number; longitude: number; altitude: number | null } | null {
  const m = value?.trim().match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?\/?$/);
  if (!m) return null;
  const latitude = Number(m[1]);
  const longitude = Number(m[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, altitude: m[3] ? Number(m[3]) : null };
}

/** ffprobe's format + stream tags (iPhone .mov, Android .mp4) → capture info. */
export function videoCaptureFromTags(tags: Record<string, unknown>): CaptureInfo {
  const lower = Object.fromEntries(Object.entries(tags).map(([k, v]) => [k.toLowerCase(), v]));
  const pick = (...keys: string[]) => keys.map((k) => lower[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const loc = parseIso6709(pick("com.apple.quicktime.location.iso6709", "location", "location-eng"));
  return {
    latitude: loc?.latitude ?? null,
    longitude: loc?.longitude ?? null,
    altitude: loc?.altitude ?? null,
    capturedAt: date(pick("com.apple.quicktime.creationdate", "creation_time")),
    deviceMake: text(pick("com.apple.quicktime.make", "com.android.manufacturer", "make")),
    deviceModel: text(pick("com.apple.quicktime.model", "com.android.model", "model")),
  };
}

// ---------------------------------------------------------------------------
// Lossless JPEG location removal
// ---------------------------------------------------------------------------

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const GPS_INFO_TAG = 0x8825;

/**
 * The JPEG with its location removed, pixels untouched: the EXIF GPS
 * directory and every value it points to are zeroed (and emptied), and any
 * XMP block carrying GPS fields is dropped. Returns null when the file isn't
 * a JPEG or can't be parsed safely — callers then must not hand the
 * original to other people.
 */
export function stripJpegLocation(input: Buffer): Buffer | null {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null;
  const buf = Buffer.from(input);
  const drop: [number, number][] = [];
  let pos = 2;
  try {
    while (pos + 4 <= buf.length) {
      if (buf[pos] !== 0xff) return null;
      const marker = buf[pos + 1]!;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        pos += 2;
        continue;
      }
      if (marker === 0xda || marker === 0xd9) break; // image data starts: no more metadata
      const len = buf.readUInt16BE(pos + 2);
      const start = pos + 4;
      const end = pos + 2 + len;
      if (end > buf.length) return null;
      if (marker === 0xe1) {
        const head = buf.subarray(start, Math.min(end, start + 64)).toString("latin1");
        if (head.startsWith("Exif\0\0")) zeroExifGps(buf, start + 6, end);
        else if (head.startsWith("http://ns.adobe.com/xap/") && /GPS(Latitude|Longitude)/.test(buf.subarray(start, end).toString("latin1"))) {
          drop.push([pos, end]);
        }
      }
      pos = end;
    }
  } catch {
    return null;
  }
  if (!drop.length) return buf;
  const parts: Buffer[] = [];
  let from = 0;
  for (const [a, b] of drop) {
    parts.push(buf.subarray(from, a));
    from = b;
  }
  parts.push(buf.subarray(from));
  return Buffer.concat(parts);
}

function zeroExifGps(buf: Buffer, tiff: number, end: number) {
  const order = buf.toString("latin1", tiff, tiff + 2);
  if (order !== "II" && order !== "MM") throw new Error("Bad TIFF header");
  const le = order === "II";
  const u16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const inRange = (o: number, n: number) => o >= tiff && o + n <= end;

  const ifd0 = tiff + u32(tiff + 4);
  if (!inRange(ifd0, 2)) throw new Error("Bad IFD0");
  const entries = u16(ifd0);
  for (let i = 0; i < entries; i++) {
    const e = ifd0 + 2 + i * 12;
    if (!inRange(e, 12)) throw new Error("Bad IFD0 entry");
    if (u16(e) !== GPS_INFO_TAG) continue;
    const gps = tiff + u32(e + 8);
    if (!inRange(gps, 2)) throw new Error("Bad GPS IFD");
    const count = u16(gps);
    for (let j = 0; j < count; j++) {
      const g = gps + 2 + j * 12;
      if (!inRange(g, 12)) throw new Error("Bad GPS entry");
      const size = (TYPE_SIZE[u16(g + 2)] ?? 1) * u32(g + 4);
      if (size > 4) {
        const at = tiff + u32(g + 8);
        if (inRange(at, size)) buf.fill(0, at, at + size);
      }
    }
    buf.fill(0, gps + 2, gps + 2 + count * 12);
    if (le) buf.writeUInt16LE(0, gps);
    else buf.writeUInt16BE(0, gps);
  }
}
