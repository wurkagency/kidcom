import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { JournalPostDto } from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { apiGet, ApiRequestError } from "../lib/api";
import { fetchMediaUrl, mediaUrl, releaseMediaUrl } from "../lib/media";

// Full-screen media viewer/player from docs/Themes/Aura/
// kidcom_media_viewer_player and kidcom_video_preview's code.html — those two
// mockups are the same screen in two states (image vs. a playing video), so
// this one route covers both rather than forking into a second route.
//
// The mockup's info sheet shows fields this app's data model doesn't have —
// category tags, GPS coordinates, codec/file-size. Rather than fabricate
// those, the sheet below shows what's actually real: the post's title/text,
// its author, and the asset's own type/dimensions (MediaAssetDto has no
// filename or byte size either, so "Download" resolves the size from the
// fetched blob instead of showing a number up front).
//
// Route: /journal/:postId/media/:mediaId?childId=... — same childId-as-
// query-param convention JournalPostPage already uses, since journal posts
// are nested under a child in the API.
export function MediaViewerPage() {
  const { postId, mediaId } = useParams<{ postId: string; mediaId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const childId = searchParams.get("childId");

  const [post, setPost] = useState<JournalPostDto | undefined>(
    () => (location.state as { post?: JournalPostDto } | null)?.post
  );
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState({ current: 0, duration: 0 });

  useEffect(() => {
    if (!childId || !postId) return;
    let cancelled = false;
    apiGet<JournalPostDto>(`/children/${childId}/journal/${postId}`)
      .then((res) => {
        if (!cancelled) setPost(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : "Couldn't load this post");
      });
    return () => {
      cancelled = true;
    };
  }, [childId, postId]);

  const media = post?.media ?? [];
  const index = media.findIndex((m) => m.id === mediaId);
  const current = index >= 0 ? media[index] : undefined;

  useEffect(() => {
    setPosterUrl(null);
    setPlaying(false);
    if (!current || current.status !== "READY") return;
    let cancelled = false;
    fetchMediaUrl(current.id).then((u) => {
      if (!cancelled) setPosterUrl(u);
    });
    return () => {
      cancelled = true;
      releaseMediaUrl(current.id);
    };
  }, [current?.id, current?.status]);

  function goTo(i: number) {
    const target = media[i];
    if (!target || !childId) return;
    navigate(`/journal/${postId}/media/${target.id}?childId=${childId}`, {
      replace: true,
      state: { post },
    });
  }

  async function handleDownload() {
    if (!current) return;
    setDownloading(true);
    try {
      const url = await fetchMediaUrl(current.id, current.type === "VIDEO" ? "original" : undefined);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${current.id}.${current.type === "VIDEO" ? "mp4" : "jpg"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setDownloading(false);
    }
  }

  function close() {
    navigate(-1);
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[60] bg-on-surface text-inverse-on-surface flex items-center justify-center p-6 text-center">
        <p className="font-body-md text-body-md">{error}</p>
      </div>
    );
  }

  if (!current) return null;

  return (
    // z-[60]: strictly above AppShell's bottom nav row (z-50) — this is a
    // full-screen takeover, so it needs to cover the floating nav/FAB too,
    // not just sit behind them.
    <div className="fixed inset-0 z-[60] bg-on-surface flex flex-col">
      {/* Dark chrome over the media, matching the mockup's floating glass controls */}
      <div className="flex items-center justify-between px-margin py-2.5 pt-safe">
        <div className="flex items-center gap-2">
          <button
            aria-label="Back"
            onClick={close}
            className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-all"
          >
            <Icon name="arrow_back" className="text-[20px]" />
          </button>
          <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-white font-label-md text-label-md flex items-center gap-1.5">
            <Icon name={current.type === "VIDEO" ? "videocam" : "image"} className="text-[15px]" />
            <span>
              {index + 1} of {media.length}
            </span>
          </div>
        </div>
        <button
          aria-label="Download original"
          onClick={handleDownload}
          disabled={downloading}
          className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-all disabled:opacity-60"
        >
          <Icon name={downloading ? "progress_activity" : "download"} className={`text-[19px] ${downloading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Media stage */}
      <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden">
        {!posterUrl ? (
          <div className="w-full h-full bg-inverse-surface animate-pulse" />
        ) : current.type === "VIDEO" ? (
          <div className="relative w-full aspect-video bg-black flex items-center justify-center">
            <video
              ref={videoRef}
              src={mediaUrl(current.id, "original")}
              crossOrigin="use-credentials"
              poster={posterUrl}
              playsInline
              className="w-full h-full object-contain"
              onClick={() => (playing ? videoRef.current?.pause() : videoRef.current?.play())}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) =>
                setProgress({ current: e.currentTarget.currentTime, duration: e.currentTarget.duration || 0 })
              }
            />
            {!playing && (
              <button
                aria-label="Play video"
                onClick={() => videoRef.current?.play()}
                className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-all shadow-lg"
              >
                <Icon name="play_arrow" className="text-[32px]" />
              </button>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-6 flex flex-col gap-2">
              <div
                className="relative w-full h-1.5 bg-white/30 rounded-full cursor-pointer"
                onClick={(e) => {
                  if (!videoRef.current || !progress.duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = (e.clientX - rect.left) / rect.width;
                  videoRef.current.currentTime = ratio * progress.duration;
                }}
              >
                <div
                  className="h-full bg-secondary-container rounded-full"
                  style={{ width: `${progress.duration ? (progress.current / progress.duration) * 100 : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-white font-label-sm text-label-sm">
                <div className="flex items-center gap-2">
                  <button onClick={() => (playing ? videoRef.current?.pause() : videoRef.current?.play())}>
                    <Icon name={playing ? "pause" : "play_arrow"} className="text-[18px]" />
                  </button>
                  <span className="font-mono text-white/90">
                    {formatTime(progress.current)} / {formatTime(progress.duration)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => videoRef.current && (videoRef.current.muted = !videoRef.current.muted)}>
                    <Icon name="volume_up" className="text-[18px]" />
                  </button>
                  <button onClick={() => videoRef.current?.requestFullscreen?.()}>
                    <Icon name="fullscreen" className="text-[18px]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <img src={posterUrl} alt={post?.title ?? ""} className="w-full h-full object-contain select-none" />
        )}

        {index > 0 && (
          <button
            aria-label="Previous"
            onClick={() => goTo(index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white active:scale-95"
          >
            <Icon name="chevron_left" />
          </button>
        )}
        {index < media.length - 1 && (
          <button
            aria-label="Next"
            onClick={() => goTo(index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white active:scale-95"
          >
            <Icon name="chevron_right" />
          </button>
        )}
      </div>

      {media.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2.5">
          {media.map((m, i) => (
            <span
              key={m.id}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-secondary-container" : "w-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      )}

      {/* Bottom info sheet */}
      {post && (
        <div className="w-full bg-surface-container-lowest text-on-surface rounded-t-[28px] p-space-lg flex flex-col gap-space-md shadow-2xl pb-safe">
          <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto -mt-1" />
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-headline-sm text-headline-sm text-on-surface leading-tight flex-1">{post.title}</h2>
            <button
              aria-label="Close details"
              onClick={close}
              className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface active:scale-95 transition-all shrink-0"
            >
              <Icon name="close" className="text-[20px]" />
            </button>
          </div>
          {post.text && <p className="font-body-md text-body-md text-on-surface-variant">{post.text}</p>}
          <div className="w-full bg-surface-container-low rounded-[20px] p-3 flex items-center gap-3">
            <Avatar name={post.authorName} avatarAssetId={post.authorAvatarUrl} kind="adult" />
            <span className="font-title-md text-title-md text-on-surface">{post.authorName}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-surface-container-low p-3 rounded-[18px] flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <Icon name={current.type === "VIDEO" ? "videocam" : "image"} className="text-[16px]" />
                <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Type</span>
              </div>
              <span className="font-title-md text-title-md text-on-surface">
                {current.type === "VIDEO" ? "Video" : "Photo"}
              </span>
            </div>
            <div className="bg-surface-container-low p-3 rounded-[18px] flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <Icon name="straighten" className="text-[16px]" />
                <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Dimensions</span>
              </div>
              <span className="font-title-md text-title-md text-on-surface">
                {current.width && current.height ? `${current.width} × ${current.height}` : "—"}
              </span>
            </div>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full bg-primary text-on-primary py-3 px-space-md rounded-full font-label-md text-label-md flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm disabled:opacity-60"
          >
            <Icon name="download" className="text-[20px]" />
            {downloading ? "Downloading…" : "Download media"}
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
