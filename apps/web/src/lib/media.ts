import { API_URL } from "./api";

// GET /media/:id requires the session cookie and does an access check
// server-side, so a plain <img src="..."> can't be used directly (no way to
// attach credentials to it in a cross-port dev setup). Fetch as a blob and
// hand back an object URL instead — the same approach any authenticated
// binary content needs.
//
// `variant: "original"` fetches the real uploaded file rather than the
// default derivative — for a VIDEO asset the derivative is just a JPG
// poster frame (see apps/api/src/worker.ts), so actual playback needs this.
// Cached separately per variant (cache key includes it) since they're
// genuinely different blobs.
const cache = new Map<string, Promise<string>>();

export async function fetchMediaUrl(
  mediaAssetId: string,
  variant?: "original"
): Promise<string> {
  const cacheKey = variant ? `${mediaAssetId}:${variant}` : mediaAssetId;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const query = variant ? `?variant=${variant}` : "";
    const res = await fetch(`${API_URL}/media/${mediaAssetId}${query}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Failed to load media ${mediaAssetId}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  })();

  cache.set(cacheKey, promise);
  return promise;
}

// Direct (not blob-fetched) URL for actual video playback — GET /media/:id
// is deliberately CORS-configured for exactly this (see apps/api/src/app.ts's
// `credentials: true` + cross-origin resource policy comment: "the web app
// ... loads media directly from api.kidcom.org via plain <img>/<video> tags —
// a different origin by design"). fetchMediaUrl's blob-download approach
// still fits that comment fine for small poster images, but for a VIDEO's
// `original` variant it downloads the entire file into memory before any
// playback can start — slow, and failure-prone on mobile for larger files
// (the reported "videos can't be played" symptom). A <video src> pointed
// here directly, with crossOrigin="use-credentials" to carry the session
// cookie, streams progressively via the browser's own HTTP handling instead.
export function mediaUrl(mediaAssetId: string, variant?: "original"): string {
  const query = variant ? `?variant=${variant}` : "";
  return `${API_URL}/media/${mediaAssetId}${query}`;
}

// Call when the last consumer of a given media asset's object URL unmounts.
// Revokes the URL (freeing the blob) and drops it from the cache so a future
// mount fetches fresh data instead of reusing a now-revoked URL. Safe to call
// even if the fetch never resolved or already failed.
export function releaseMediaUrl(mediaAssetId: string, variant?: "original"): void {
  const cacheKey = variant ? `${mediaAssetId}:${variant}` : mediaAssetId;
  const cached = cache.get(cacheKey);
  if (!cached) return;
  cache.delete(cacheKey);
  cached.then((url) => URL.revokeObjectURL(url)).catch(() => {});
}
