import { useEffect, useState } from "react";

import { fetchMediaUrl, releaseMediaUrl } from "../lib/media";
import { Avatar as AvatarRoot, AvatarFallback, AvatarImage } from "./ui/avatar";

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

// Built on Radix's Avatar primitive (@radix-ui/react-avatar, via
// ui/avatar.tsx) — the highest-traffic of the shadcn swaps (rendered inside
// Header.tsx on nearly every screen), so kept as close to the original as
// possible: AvatarFallback renders the same kind-based placeholder <img>
// this component always fell back to, just moved off a single conditional
// `src` swap onto Radix's own image-load-state tracking, which as a side
// effect now also falls back correctly if a resolved URL 404s, not only when
// there's no avatarAssetId at all.
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
    <AvatarRoot className={`${SIZE_CLASSES[size]} rounded-full shrink-0 bg-surface-container-lowest ${className}`}>
      {resolvedUrl && <AvatarImage src={resolvedUrl} alt="" title={name} className="object-cover" />}
      <AvatarFallback delayMs={0} className="bg-transparent rounded-none">
        <img src={PLACEHOLDER_SRC[kind]} alt="" title={name} className="w-full h-full object-cover" />
      </AvatarFallback>
    </AvatarRoot>
  );
}
