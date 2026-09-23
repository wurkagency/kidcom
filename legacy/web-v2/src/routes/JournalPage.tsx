import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { JournalPostDto } from "@kidcom/shared";

import { JournalPostCard } from "../components/JournalPostCard";
import { ViewSwitcherDropdown } from "../components/ViewSwitcherDropdown";
import { apiGet, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { MediaGalleryTab } from "./MediaGalleryPage";

const PAGE_LIMIT = 20;
const POLL_INTERVAL_MS = 4000;

const JOURNAL_TAB_OPTIONS: { value: "journal" | "media"; label: string }[] = [
  { value: "journal", label: "Journal" },
  { value: "media", label: "Media Gallery" },
];

type ChildFeedState = {
  items: JournalPostDto[];
  nextCursor: string | null;
};

// Matches docs/Themes/Aura/kidcom_moments_feed_1/code.html: a feed of posts
// for the selected child (or all children). The composer used to be reached
// through a page-local FAB here; that's now redundant with the global
// QuickAddButton's "Add moment" (see AppShell.tsx) and was removed rather
// than left stacked on top of it. Same pill-tab pattern as MessagesPage
// (?tab=media) merges in the Media Gallery as a second tab rather than a
// separate screen.
export function JournalPage() {
  const { user, children } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "media" ? "media" : "journal";
  const [filterChildId, setFilterChildId] = useState<string | "ALL">("ALL");
  const [feeds, setFeeds] = useState<Record<string, ChildFeedState>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetChildIds = filterChildId === "ALL" ? children.map((c) => c.id) : [filterChildId];

  async function loadFirstPage() {
    if (children.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        targetChildIds.map((id) =>
          apiGet<{ items: JournalPostDto[]; nextCursor: string | null }>(
            `/children/${id}/journal?limit=${PAGE_LIMIT}`
          ).then((r) => [id, { items: r.items, nextCursor: r.nextCursor }] as const)
        )
      );
      setFeeds((prev) => ({ ...prev, ...Object.fromEntries(results) }));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load the journal");
    } finally {
      setLoading(false);
    }
  }

  // Re-fetches the first page for every child currently in view, merging
  // fresh status/reaction/comment data onto whatever's already loaded
  // (including pages loaded via "Load more") rather than discarding them.
  async function refreshInPlace() {
    if (children.length === 0) return;
    try {
      const results = await Promise.all(
        targetChildIds.map((id) =>
          apiGet<{ items: JournalPostDto[]; nextCursor: string | null }>(
            `/children/${id}/journal?limit=${PAGE_LIMIT}`
          ).then((r) => [id, r.items] as const)
        )
      );
      setFeeds((prev) => {
        const next = { ...prev };
        for (const [id, freshItems] of results) {
          const existing = prev[id];
          const freshIds = new Set(freshItems.map((p) => p.id));
          const staleTail = (existing?.items ?? []).filter((p) => !freshIds.has(p.id));
          next[id] = {
            items: [...freshItems, ...staleTail],
            nextCursor: existing?.nextCursor ?? null,
          };
        }
        return next;
      });
    } catch {
      // Silent — this is a background refresh, the manual load already
      // surfaces errors to the user.
    }
  }

  async function loadMore(childId: string) {
    const cursor = feeds[childId]?.nextCursor;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await apiGet<{ items: JournalPostDto[]; nextCursor: string | null }>(
        `/children/${childId}/journal?limit=${PAGE_LIMIT}&cursor=${encodeURIComponent(cursor)}`
      );
      setFeeds((prev) => ({
        ...prev,
        [childId]: {
          items: [...(prev[childId]?.items ?? []), ...res.items],
          nextCursor: res.nextCursor,
        },
      }));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load more posts");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterChildId, children.length]);

  const feed = targetChildIds
    .flatMap((id) => feeds[id]?.items ?? [])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const hasProcessingMedia = feed.some((p) => p.media.some((m) => m.status === "PROCESSING"));

  // While any visible post still has media processing, poll for updates so
  // "Processing…" resolves to READY/FAILED without a manual refresh. Stops
  // itself as soon as nothing is processing, and is cleared on unmount.
  const refreshInPlaceRef = useRef(refreshInPlace);
  refreshInPlaceRef.current = refreshInPlace;
  useEffect(() => {
    if (!hasProcessingMedia) return;
    const interval = setInterval(() => {
      refreshInPlaceRef.current();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasProcessingMedia]);

  const anyNextCursor = targetChildIds.some((id) => feeds[id]?.nextCursor);

  function handleReacted(postId: string, reactedByMe: boolean, reactionCount: number) {
    setFeeds((prev) => {
      const next: Record<string, ChildFeedState> = {};
      for (const [childId, state] of Object.entries(prev)) {
        next[childId] = {
          ...state,
          items: state.items.map((p) =>
            p.id === postId ? { ...p, reactedByMe, reactionCount } : p
          ),
        };
      }
      return next;
    });
  }

  function handleDeleted(postId: string) {
    setFeeds((prev) => {
      const next: Record<string, ChildFeedState> = {};
      for (const [childId, state] of Object.entries(prev)) {
        next[childId] = { ...state, items: state.items.filter((p) => p.id !== postId) };
      }
      return next;
    });
  }

  if (children.length === 0) {
    return (
      <section className="px-container-padding pt-6 flex flex-col gap-2">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
          Moments
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Add a child first to start sharing memories.
        </p>
      </section>
    );
  }

  function setTab(next: "journal" | "media") {
    setSearchParams(next === "media" ? { tab: "media" } : {}, { replace: true });
  }

  return (
    <div className="flex flex-col w-full h-full pb-20 relative">
      {/* "Moments" + "Journal ⌄" dropdown, matching
          docs/Themes/Aura/kidcom_moments_feed_1/code.html — replaces the
          Journal/Media Gallery segmented pill pair with the Switch View
          dropdown Calendar and Lists now use too. */}
      <div className="px-container-padding py-section-margin flex items-center justify-between gap-2">
        <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface shrink-0">Moments</h1>
        <ViewSwitcherDropdown options={JOURNAL_TAB_OPTIONS} value={tab} onChange={setTab} triggerIcon="dashboard" />
      </div>

      {tab === "journal" && children.length > 1 && (
        <div className="px-container-padding pb-2">
          <select
            value={filterChildId}
            onChange={(e) => setFilterChildId(e.target.value)}
            className="flex items-center gap-2 bg-surface-container-high px-4 py-2 rounded-full font-label-sm text-label-sm text-on-surface-variant"
          >
            <option value="ALL">All Children</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName}
              </option>
            ))}
          </select>
        </div>
      )}

      {tab === "media" ? (
        <MediaGalleryTab />
      ) : (
        <>
          <div className="flex-1 px-container-padding flex flex-col gap-element-gap pb-section-margin">
            {loading && (
              <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
            )}
            {error && (
              <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
                {error}
              </p>
            )}
            {!loading && feed.length === 0 && (
              <p className="font-body-md text-body-md text-on-surface-variant">
                No moments yet — use Add moment to share the first one.
              </p>
            )}
            {feed.map((post) => (
              <JournalPostCard
                key={post.id}
                childId={post.childIds[0]}
                post={post}
                currentUserId={user?.id}
                onReacted={handleReacted}
                onDeleted={handleDeleted}
              />
            ))}

            {!loading && anyNextCursor && (
              <button
                onClick={() => targetChildIds.forEach((id) => feeds[id]?.nextCursor && loadMore(id))}
                disabled={loadingMore}
                className="self-center mt-2 px-6 py-2 rounded-full bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
