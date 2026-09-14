import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { JournalMediaDto } from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { fetchMediaUrl } from "../lib/media";
import { apiGet, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Matches docs/stitch_splitkid/media_gallery/code.html: every photo/video
// across a family's journal posts, grouped by month, with type and
// per-child filters and a real multi-select "Download N Selected" flow.
// Rendered as the "Media Gallery" tab on JournalPage (same tab pattern as
// Messages/Personal Notes) rather than its own screen — /journal/media
// redirects to /journal?tab=media in App.tsx for any old links.
export function MediaGalleryTab() {
  const { children } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<JournalMediaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"ALL" | "IMAGE" | "VIDEO">("ALL");
  const [childFilter, setChildFilter] = useState<string | "ALL">("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (children.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const results = await Promise.all(
          children.map((c) => apiGet<{ items: JournalMediaDto[] }>(`/children/${c.id}/journal/media`))
        );
        if (cancelled) return;
        // Same media can theoretically appear once per tagged child — dedupe by id.
        const byId = new Map<string, JournalMediaDto>();
        for (const res of results) {
          for (const item of res.items) byId.set(item.id, item);
        }
        setItems(Array.from(byId.values()).sort((a, b) => b.postCreatedAt.localeCompare(a.postCreatedAt)));
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : "Couldn't load media");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [children]);

  const filtered = items.filter((item) => {
    if (typeFilter !== "ALL" && item.type !== typeFilter) return false;
    if (childFilter !== "ALL" && !item.childIds.includes(childFilter)) return false;
    return true;
  });

  const groups = useMemo(() => {
    const byMonth = new Map<string, JournalMediaDto[]>();
    for (const item of filtered) {
      const d = new Date(item.postCreatedAt);
      const key = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(item);
    }
    return Array.from(byMonth.entries());
  }, [filtered]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDownloadSelected() {
    setDownloading(true);
    try {
      for (const item of items.filter((i) => selected.has(i.id))) {
        const url = await fetchMediaUrl(item.id, item.type === "VIDEO" ? "original" : undefined);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${item.id}.${item.type === "VIDEO" ? "mp4" : "jpg"}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setSelected(new Set());
    } finally {
      setDownloading(false);
    }
  }

  if (children.length === 0) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Add a child first to see media here.</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col w-full h-full relative">
      <div className="flex flex-col gap-element-gap pt-2 pb-4 bg-surface px-container-padding">
        <div className="flex gap-2 overflow-x-auto">
          {(["ALL", "IMAGE", "VIDEO"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 px-4 py-2 rounded-full font-label-md transition-colors ${
                typeFilter === t ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container-high text-on-surface"
              }`}
            >
              {t === "ALL" ? "All Media" : t === "IMAGE" ? "Photos" : "Videos"}
            </button>
          ))}
        </div>
        {children.length > 1 && (
          <div className="flex gap-3 overflow-x-auto items-center">
            <button
              onClick={() => setChildFilter("ALL")}
              className={`shrink-0 h-10 px-4 rounded-full font-label-md transition-colors ${
                childFilter === "ALL" ? "bg-secondary-container text-on-secondary-container ring-2 ring-primary/20" : "bg-surface-container text-on-surface-variant"
              }`}
            >
              All Children
            </button>
            {children.map((c) => (
              <button
                key={c.id}
                onClick={() => setChildFilter(c.id)}
                className={`shrink-0 h-10 pl-1 pr-4 rounded-full flex items-center gap-2 transition-colors ${
                  childFilter === c.id ? "bg-secondary-container text-on-secondary-container ring-2 ring-primary/20" : "bg-surface-container text-on-surface-variant opacity-70"
                }`}
              >
                <Avatar name={c.firstName} avatarAssetId={c.profileImageUrl} kind="child" size="xs" />
                {c.firstName}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 px-container-padding flex flex-col gap-6 pb-32">
        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
        )}
        {loading && <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">No media yet.</p>
        )}
        {groups.map(([month, monthItems]) => (
          <div key={month} className="flex flex-col gap-3">
            <div className="flex justify-between items-end">
              <h2 className="font-headline-md text-on-surface">{month}</h2>
              <span className="font-label-sm text-on-surface-variant">{monthItems.length} Items</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {monthItems.map((item) => (
                <GalleryThumb
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  hasSelection={selected.size > 0}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onOpen={() => navigate(`/journal/${item.postId}?childId=${item.childIds[0]}`)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-48px)] max-w-sm">
          <button
            onClick={handleDownloadSelected}
            disabled={downloading}
            className="w-full h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center gap-2 font-label-md active:scale-95 transition-transform disabled:opacity-60"
          >
            <Icon name="download" />
            {downloading ? "Downloading…" : `Download ${selected.size} Selected`}
          </button>
        </div>
      )}
    </div>
  );
}

const LONG_PRESS_MS = 450;

// Exported (not just used internally by MediaGalleryTab) so the post-launch
// backlog Phase J Android fix is directly testable without mounting the
// whole gallery page and its data-fetching.
export function GalleryThumb({
  item,
  selected,
  hasSelection,
  onToggleSelect,
  onOpen,
}: {
  item: JournalMediaDto;
  selected: boolean;
  hasSelection: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (item.status === "READY") {
      fetchMediaUrl(item.id).then((u) => {
        if (!cancelled) setUrl(u);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [item.id, item.status]);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  // Real touch-and-hold: onPointerDown starts a timer; if it fires before
  // the pointer lifts/leaves/cancels, this is a long-press — toggle
  // selection and mark the gesture "handled" so the pointerup that follows
  // doesn't also open the post.
  //
  // Post-launch backlog Phase J — Android fix: on Android Chrome, a
  // touch-and-hold over an <img> can trigger the browser's own native
  // long-press handling (image save/open/copy menu) concurrently with our
  // JS timer, even with pointer-events:none on the <img> and touch-action:
  // manipulation on this container — neither of those suppresses Chrome's
  // native long-press-on-image gesture specifically. That native handling
  // fires a `pointercancel` before our timer resolves, which clears the
  // timer without ever toggling selection — the reported "can't
  // deselect/select on Android" symptom. preventDefault() on the pointer
  // down event is what actually suppresses it.
  function handlePointerDown(e: PointerEvent) {
    e.preventDefault();
    longPressFiredRef.current = false;
    clearTimer();
    timerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onToggleSelect();
    }, LONG_PRESS_MS);
  }

  function handlePointerUp() {
    clearTimer();
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (hasSelection) onToggleSelect();
    else onOpen();
  }

  function handlePointerLeaveOrCancel() {
    clearTimer();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeaveOrCancel}
      onPointerCancel={handlePointerLeaveOrCancel}
      onContextMenu={(e) => {
        // Harmless desktop affordance — right-click also toggles selection.
        e.preventDefault();
        onToggleSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (hasSelection ? onToggleSelect : onOpen)();
      }}
      className="aspect-square rounded-xl overflow-hidden relative cursor-pointer select-none bg-surface-container touch-manipulation"
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
    >
      {selected && (
        <div className="absolute inset-0 bg-primary/20 z-10 flex items-center justify-center border-4 border-primary rounded-xl">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-on-primary shadow-md">
            <Icon name="check" className="text-[20px]" />
          </div>
        </div>
      )}
      {item.type === "VIDEO" && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-[5]">
          <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-white">
            <Icon name="play_arrow" className="text-[24px]" />
          </div>
        </div>
      )}
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="w-full h-full object-cover pointer-events-none"
          style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
        />
      ) : (
        <div className="w-full h-full animate-pulse bg-surface-container-high" />
      )}
    </div>
  );
}
