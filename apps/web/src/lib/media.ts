import { API_URL } from "./api";

// GET /media/:id requires the session cookie and does an access check
// server-side, so a plain <img src="..."> can't be used directly (no way to
// attach credentials to it in a cross-port dev setup). Fetch as a blob and
// hand back an object URL instead — the same approach any authenticated
// binary content needs.
const cache = new Map<string, Promise<string>>();

export async function fetchMediaUrl(mediaAssetId: string): Promise<string> {
  const cached = cache.get(mediaAssetId);
  if (cached) return cached;

  const promise = (async () => {
    const res = await fetch(`${API_URL}/media/${mediaAssetId}`, { credentials: "include" });
    if (!res.ok) throw new Error(`Failed to load media ${mediaAssetId}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  })();

  cache.set(mediaAssetId, promise);
  return promise;
}

// Call when the last consumer of a given media asset's object URL unmounts.
// Revokes the URL (freeing the blob) and drops it from the cache so a future
// mount fetches fresh data instead of reusing a now-revoked URL. Safe to call
// even if the fetch never resolved or already failed.
export function releaseMediaUrl(mediaAssetId: string): void {
  const cached = cache.get(mediaAssetId);
  if (!cached) return;
  cache.delete(mediaAssetId);
  cached.then((url) => URL.revokeObjectURL(url)).catch(() => {});
}
