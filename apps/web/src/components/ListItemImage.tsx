import { useEffect, useState, type ReactNode } from "react";

import { fetchMediaUrl, releaseMediaUrl } from "../lib/media";

// Resolves a Necessity/Wishlist item's optional single photo (imageAssetId)
// into a real <img>, falling back to whatever placeholder the caller passes
// (an icon, typically) when there's no image or it's still loading — same
// fetch-as-blob approach Avatar.tsx already uses, since GET /media/:id needs
// the session cookie and a plain <img src> can't attach one.
export function ListItemImage({
  imageAssetId,
  alt,
  className = "",
  fallback,
}: {
  imageAssetId: string | null;
  alt: string;
  className?: string;
  fallback: ReactNode;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!imageAssetId) {
      setResolvedUrl(null);
      return;
    }
    fetchMediaUrl(imageAssetId)
      .then((url) => {
        if (!cancelled) setResolvedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
      });
    return () => {
      cancelled = true;
      releaseMediaUrl(imageAssetId);
    };
  }, [imageAssetId]);

  if (!resolvedUrl) return <>{fallback}</>;
  return <img src={resolvedUrl} alt={alt} className={`object-cover ${className}`} />;
}
