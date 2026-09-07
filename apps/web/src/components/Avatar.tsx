import { useEffect, useState } from "react";

import { fetchMediaUrl, releaseMediaUrl } from "../lib/media";

// Single place that resolves "an avatarUrl/profileImageUrl field, which is
// actually a MediaAsset id" into a real displayable image, or falls back to
// one of the two placeholder illustrations (apps/web/public/avatars/) keyed
// by adult vs child — used everywhere a person's photo shows up, so a photo
// set anywhere in the app now actually propagates everywhere instead of each
// page reimplementing (or forgetting to implement) this resolution.
const SIZE_CLASSES: Record<"xs" | "sm" | "md" | "lg" | "xl" | "full", string> = {
  xs: "w-6 h-6",
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-16 h-16",
  xl: "w-32 h-32",
  // For embedding inside an already-sized wrapper (e.g. AvatarUpload's
  // button, which owns the actual dimensions) — no fixed size of its own,
  // just fills whatever box it's placed in.
  full: "w-full h-full",
};

const PLACEHOLDER_SRC: Record<"adult" | "child", string> = {
  adult: "/avatars/adult-placeholder.svg",
  child: "/avatars/child-placeholder.svg",
};

export function Avatar({
  name,
  avatarAssetId,
  kind = "adult",
  size = "sm",
  className = "",
}: {
  name: string;
  avatarAssetId?: string | null;
  kind?: "adult" | "child";
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!avatarAssetId) {
      setResolvedUrl(null);
      return;
    }
    fetchMediaUrl(avatarAssetId)
      .then((url) => {
        if (!cancelled) setResolvedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
      });
    return () => {
      cancelled = true;
      releaseMediaUrl(avatarAssetId);
    };
  }, [avatarAssetId]);

  return (
    <img
      src={resolvedUrl ?? PLACEHOLDER_SRC[kind]}
      alt=""
      title={name}
      className={`${SIZE_CLASSES[size]} rounded-full object-cover shrink-0 bg-surface-container-lowest ${className}`}
    />
  );
}
