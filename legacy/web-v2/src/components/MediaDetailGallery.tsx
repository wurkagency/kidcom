import { useEffect, useRef, useState } from "react";
import type { MediaAssetDto } from "@kidcom/shared";

import { Icon } from "./Icon";
import { fetchMediaUrl, mediaUrl, releaseMediaUrl } from "../lib/media";

// Same fetch/play logic as MediaThumb (JournalPostCard.tsx), but for the
// post *detail* view: the overview/feed/gallery keep a cropped 4:3 preview
// (PREVIEW_ASPECT there), while opening a post must show the original,
// uncropped file — no forced aspect ratio, no object-cover. Images render at
// their natural size (capped by a max-height so a very tall photo doesn't
// dominate the screen); video keeps native controls with no forced box.
function MediaDetailThumb({ media, alt }: { media: MediaAssetDto; alt: string }) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (media.status !== "READY") return;
    let cancelled = false;
    fetchMediaUrl(media.id).then((u) => {
      if (!cancelled) {
        setPosterUrl(u);
        loadedIdRef.current = media.id;
      }
    });
    return () => {
      cancelled = true;
      if (loadedIdRef.current) {
        releaseMediaUrl(loadedIdRef.current);
        loadedIdRef.current = null;
      }
    };
  }, [media.id, media.status]);

  if (media.status === "FAILED") {
    return (
      <div className="w-full aspect-[4/3] rounded-lg bg-surface-container-high flex flex-col items-center justify-center gap-1">
        <Icon name="broken_image" className="text-2xl text-on-surface-variant" />
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          Couldn't process this file
        </span>
      </div>
    );
  }

  if (media.status !== "READY") {
    return (
      <div className="w-full aspect-[4/3] rounded-lg bg-surface-container-high flex items-center justify-center">
        <span className="font-label-sm text-label-sm text-on-surface-variant">Processing…</span>
      </div>
    );
  }
  if (!posterUrl) {
    return <div className="w-full aspect-[4/3] rounded-lg bg-surface-container-high animate-pulse" />;
  }

  if (media.type === "VIDEO") {
    if (playing) {
      if (playbackError) {
        return (
          <div className="w-full aspect-[4/3] rounded-lg bg-surface-container-high flex flex-col items-center justify-center gap-1">
            <Icon name="broken_image" className="text-2xl text-on-surface-variant" />
            <span className="font-label-sm text-label-sm text-on-surface-variant">Couldn't play this video</span>
          </div>
        );
      }
      return (
        <video
          src={mediaUrl(media.id, "original")}
          crossOrigin="use-credentials"
          poster={posterUrl}
          controls
          autoPlay
          playsInline
          onError={() => setPlaybackError(true)}
          className="w-full max-h-[70vh] rounded-lg bg-black"
        />
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPlaybackError(false);
          setPlaying(true);
        }}
        aria-label="Play video"
        className="relative block w-full"
      >
        <img src={posterUrl} alt={alt} className="w-full max-h-[70vh] h-auto object-contain rounded-lg" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-12 h-12 rounded-full bg-black/60 text-white flex items-center justify-center">
            <Icon name="play_arrow" className="text-2xl" />
          </span>
        </span>
      </button>
    );
  }

  return <img src={posterUrl} alt={alt} className="w-full max-h-[70vh] h-auto object-contain rounded-lg" />;
}

// A grid isn't right here the way it is for the overview — the whole point
// is showing each original at its own natural size — so multiple items just
// stack vertically instead.
export function MediaDetailGallery({ media, alt }: { media: MediaAssetDto[]; alt: string }) {
  if (media.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {media.map((m) => (
        <MediaDetailThumb key={m.id} media={m} alt={alt} />
      ))}
    </div>
  );
}
