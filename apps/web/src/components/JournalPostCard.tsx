import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { JournalPostDto, MediaAssetDto } from "@kidcom/shared";

import { Icon } from "./Icon";
import { fetchMediaUrl, releaseMediaUrl } from "../lib/media";
import { apiPost, apiDelete, ApiRequestError } from "../lib/api";

function MediaThumb({ media, alt }: { media: MediaAssetDto; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (media.status !== "READY") return;
    let cancelled = false;
    fetchMediaUrl(media.id).then((u) => {
      if (!cancelled) {
        setUrl(u);
        loadedIdRef.current = media.id;
      }
    });
    return () => {
      cancelled = true;
      // Release the object URL this instance fetched, so it doesn't leak —
      // and drop it from media.ts's cache so a later mount re-fetches fresh
      // rather than reusing a revoked URL.
      if (loadedIdRef.current) {
        releaseMediaUrl(loadedIdRef.current);
        loadedIdRef.current = null;
      }
    };
  }, [media.id, media.status]);

  if (media.status === "FAILED") {
    return (
      <div className="w-full h-48 rounded-lg bg-surface-container-high flex flex-col items-center justify-center gap-1">
        <Icon name="broken_image" className="text-2xl text-on-surface-variant" />
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          Couldn't process this file
        </span>
      </div>
    );
  }

  if (media.status !== "READY") {
    return (
      <div className="w-full h-48 rounded-lg bg-surface-container-high flex items-center justify-center">
        <span className="font-label-sm text-label-sm text-on-surface-variant">Processing…</span>
      </div>
    );
  }
  if (!url) {
    return <div className="w-full h-48 rounded-lg bg-surface-container-high animate-pulse" />;
  }
  return (
    <div className="relative">
      <img src={url} alt={alt} className="w-full h-48 object-cover rounded-lg" />
      {media.type === "VIDEO" && (
        <span className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center">
          <Icon name="play_arrow" className="text-base" />
        </span>
      )}
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
  const media = post.media[0];
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

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-label-md">
            {post.authorName.charAt(0).toUpperCase()}
          </div>
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
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete post"
            className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-error transition-colors disabled:opacity-60"
          >
            <Icon name="delete" className="text-lg" />
          </button>
        )}
      </div>

      {media && <MediaThumb media={media} alt={post.title} />}

      <p className="font-body-md text-body-md text-text-main line-clamp-3">{post.text}</p>

      {reactError && (
        <p className="font-label-sm text-label-sm text-error -mt-2">{reactError}</p>
      )}

      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={handleReact}
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
