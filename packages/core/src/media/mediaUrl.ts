import { apiUrl } from "../api/client";

/**
 * URL for a media asset (avatars, photos, video). GET /media/:id checks the
 * session and ChildAccess live on every request, and the cookie travels with
 * plain <img>/<video> requests (same origin in dev via the /api proxy,
 * same site in production), so no blob round-trip is needed.
 */
export function mediaUrl(mediaAssetId: string | null | undefined, variant?: "original"): string | undefined {
  if (!mediaAssetId) return undefined;
  return apiUrl(`/media/${encodeURIComponent(mediaAssetId)}${variant ? `?variant=${variant}` : ""}`);
}
