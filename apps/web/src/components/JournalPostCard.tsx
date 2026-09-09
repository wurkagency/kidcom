import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { JournalPostDto, MediaAssetDto } from "@kidcom/shared";

import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import { fetchMediaUrl, releaseMediaUrl } from "../lib/media";
import { apiPost, apiDelete, ApiRequestError } from "../lib/api";

// Shown for one attached photo or video — a grid of these covers "show all
// media, not just the first" (see the gallery below). Video plays for real
// (an actual <video>, fetched via the ?variant=original endpoint) instead of
// the old inert poster-image-with-a-play-badge; this is the MVP approach —
// the whole file is fetched as a blob via the same authenticated flow images
// already use, no HTTP Range/streaming support, which is an acceptable
// tradeoff for a family-journal feature rather than a video product.
// Landscape 4:3 box for every preview — image, video poster, and every
// loading/error/processing placeholder state — so the feed and gallery grid
// don't jump around as media loads in at different aspect ratios. The photo
// itself is shown with object-contain (never object-cover) so its real
// proportions are always preserved exactly — a portrait or square photo
// letterboxes inside the 4:3 box (filled with the same neutral background as
// the loading state) rather than being cropped or stretched.
const PREVIEW_ASPECT = "aspect-[4/3]";
const PREVIEW_FIT = "object-contain bg-surface-container-high";

export function MediaThumb({ media, alt }: { media: MediaAssetDto; alt: string }) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
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
      if (media.type === "VIDEO") {
        releaseMediaUrl(media.id, "original");
      }
    };
  }, [media.id, media.status, media.type]);

  async function handlePlay() {
    if (!videoUrl) {
      const url = await fetchMediaUrl(media.id, "original");
      setVideoUrl(url);
    }
    setPlaying(true);
  }

  if (media.status === "FAILED") {
    return (
      <div className={`w-full ${PREVIEW_ASPECT} rounded-lg bg-surface-container-high flex flex-col items-center justify-center gap-1`}>
        <Icon name="broken_image" className="text-2xl text-on-surface-variant" />
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          Couldn't process this file
        </span>
      </div>
    );
  }

  if (media.status !== "READY") {
    return (
      <div className={`w-full ${PREVIEW_ASPECT} rounded-lg bg-surface-container-high flex items-center justify-center`}>
        <span className="font-label-sm text-label-sm text-on-surface-variant">Processing…</span>
      </div>
    );
  }
  if (!posterUrl) {
    return <div className={`w-full ${PREVIEW_ASPECT} rounded-lg bg-surface-container-high animate-pulse`} />;
  }

  if (media.type === "VIDEO") {
    if (playing) {
      return (
        <video
          src={videoUrl ?? undefined}
          poster={posterUrl}
          controls
          autoPlay
          className={`w-full ${PREVIEW_ASPECT} object-contain rounded-lg bg-black`}
        />
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          // The card this sits in is itself a click target that navigates
          // to the full post — without this, pressing Play would both start
          // the video AND navigate away from under it.
          e.stopPropagation();
          handlePlay();
        }}
        aria-label="Play video"
        className="relative block w-full"
      >
        <img src={posterUrl} alt={alt} className={`w-full ${PREVIEW_ASPECT} ${PREVIEW_FIT} rounded-lg`} />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-12 h-12 rounded-full bg-black/60 text-white flex items-center justify-center">
            <Icon name="play_arrow" className="text-2xl" />
          </span>
        </span>
      </button>
    );
  }

  return <img src={posterUrl} alt={alt} className={`w-full ${PREVIEW_ASPECT} ${PREVIEW_FIT} rounded-lg`} />;
}

// A grid when there's more than one attachment, a single full-width item
// otherwise — every attached photo/video shows up now, not just media[0].
export function MediaGallery({ media, alt }: { media: MediaAssetDto[]; alt: string }) {
  if (media.length === 0) return null;
  if (media.length === 1) {
    return <MediaThumb media={media[0]} alt={alt} />;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {media.map((m) => (
        <MediaThumb key={m.id} media={m} alt={alt} />
      ))}
    </div>
  );
}

function relativeDay(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Matches the post card in docs/stitch_splitkid/journal_feed/code.html.
export function JournalPostCard({
  childId,
  post,
  currentUserId,
  onReacted,
  onDeleted,
}: {
  childId: string;
  post: JournalPostDto;
  currentUserId?: string;
  onReacted: (postId: string, reactedByMe: boolean, reactionCount: number) => void;
  onDeleted?: (postId: string) => void;
}) {
  const navigate = useNavigate();
  const [reacting, setReacting] = useState(false);
  const [reactError, setReactError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleReact() {
    if (reacting) return;
    setReacting(true);
    setReactError(null);
    try {
      const result = await apiPost<{ reactedByMe: boolean; reactionCount: number }>(
        `/children/${childId}/journal/${post.id}/reactions`
      );
      onReacted(post.id, result.reactedByMe, result.reactionCount);
    } catch (err) {
      setReactError(err instanceof ApiRequestError ? err.message : "Couldn't react — try again");
    } finally {
      setReacting(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm("Delete this journal post? This can't be undone.")) return;
    setDeleting(true);
    try {
      await apiDelete<void>(`/children/${childId}/journal/${post.id}`);
      onDeleted?.(post.id);
    } catch {
      setDeleting(false);
      window.alert("Couldn't delete that post — try again.");
    }
  }

  function openPost() {
    navigate(`/journal/${post.id}?childId=${childId}`, { state: { post } });
  }

  return (
    // The card itself opens the full post/comment thread on click — a plain
    // div with a click+keyboard handler rather than wrapping it in <Link>,
    // since it contains real interactive children (the delete button, the
    // Love button, the video Play button) and nesting those inside an <a>
    // is invalid HTML; each of those stops propagation so they act on
    // themselves instead of also navigating.
    <div
      role="button"
      tabIndex={0}
      onClick={openPost}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPost();
        }
      }}
      className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-4 cursor-pointer"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={post.authorName} avatarAssetId={post.authorAvatarUrl} kind="adult" size="md" />
          <div className="min-w-0">
            <h3 className="font-label-md text-label-md text-on-surface line-clamp-1">
              {post.title}
            </h3>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {relativeDay(post.createdAt)}
            </p>
          </div>
        </div>
        {currentUserId && post.authorId === currentUserId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            disabled={deleting}
            aria-label="Delete post"
            className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-error transition-colors disabled:opacity-60 shrink-0"
          >
            <Icon name="delete" className="text-lg" />
          </button>
        )}
      </div>

      <MediaGallery media={post.media} alt={post.title} />

      {post.text && (
        <p className="font-body-md text-body-md text-text-main line-clamp-3">{post.text}</p>
      )}

      {reactError && (
        <p className="font-label-sm text-label-sm text-error -mt-2">{reactError}</p>
      )}

      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleReact();
          }}
          disabled={reacting}
          className={`flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
            post.reactedByMe ? "text-primary" : "text-on-surface-variant hover:text-primary"
          }`}
        >
          <Icon name="favorite" className="text-lg" />
          <span className="font-label-sm text-label-sm">
            {post.reactionCount > 0 ? post.reactionCount : "Love"}
          </span>
        </button>
        <Link
          to={`/journal/${post.id}?childId=${childId}`}
          state={{ post }}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-on-surface-variant hover:text-primary transition-colors"
        >
          <Icon name="chat_bubble" className="text-lg" />
          <span className="font-label-sm text-label-sm">
            {post.commentCount > 0 ? `${post.commentCount} Comments` : "Comment"}
          </span>
        </Link>
      </div>
    </div>
  );
}
