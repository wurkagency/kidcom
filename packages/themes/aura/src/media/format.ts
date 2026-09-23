import type { Formatters } from "@kidcom/core";

// Labels for the viewer's details sheet and the Download screen.

/** "12,6 MB" / "840 KB" in the UI locale. */
export function formatBytes(fmt: Formatters, bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024 * 1024) return `${fmt.number(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${fmt.number(bytes / (1024 * 1024), { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}

const CODECS: Record<string, string> = {
  hevc: "H.265 (HEVC)",
  h265: "H.265 (HEVC)",
  h264: "H.264 (AVC)",
  vp9: "VP9",
  av1: "AV1",
  prores: "ProRes",
};

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
  "image/png": "PNG",
  "image/webp": "WebP",
};

/** "H.265 (HEVC)" for videos, "JPEG" / "HEIC" for photos. */
export function formatLabel(type: "IMAGE" | "VIDEO", codec: string | null, mimeType: string | null): string {
  if (type === "VIDEO") return (codec && (CODECS[codec.toLowerCase()] ?? codec.toUpperCase())) || "—";
  return (mimeType && (IMAGE_TYPES[mimeType] ?? mimeType.replace("image/", "").toUpperCase())) || "—";
}

/** "UHD" / "FHD" / "HD" by the longer side. */
export function resolutionClass(width: number | null, height: number | null): string | null {
  if (!width || !height) return null;
  const long = Math.max(width, height);
  if (long >= 3840) return "UHD";
  if (long >= 1920) return "FHD";
  if (long >= 1280) return "HD";
  return "SD";
}

/** "01:24" */
export const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
