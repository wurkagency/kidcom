import { useMemo, useRef, useState } from "react";
import type { MomentMediaDto } from "@kidcom/shared";
import { mediaUrl, paths, useActiveChildren, useFormat, useMomentFilters, useMomentsGallery, useNavigate, useT } from "@kidcom/core";

import { EmptyCard } from "../calendar/Sections";
import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { Skeleton } from "../ui/skeleton";
import { PlanNotice } from "../billing/PlanNotice";
import { DurationBadge, MomentFilterBar, MomentsTitle } from "../moments/parts";

// kidcom_media_gallery: every photo and video across the selected children,
// by month. Long-press a tile to start selecting; the batch bar then offers
// Select all and Download (→ the Download screen).

const TIP_KEY = "kidcom.galleryTipDismissed";
const LONG_PRESS_MS = 450;

function readTipDismissed() {
  try {
    return localStorage.getItem(TIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function GalleryScreen() {
  const { t } = useT("moments");
  const fmt = useFormat();
  const navigate = useNavigate();
  const { filter, selected: kids } = useActiveChildren();
  const { filters, setFilters } = useMomentFilters();
  const { data: items = [], isLoading } = useMomentsGallery(filter.kind === "all" ? null : kids.map((c) => c.id), filters);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [tipHidden, setTipHidden] = useState(readTipDismissed);

  const months = useMemo(() => {
    const groups = new Map<string, MomentMediaDto[]>();
    for (const item of items) {
      const key = (item.occurredOn ?? item.postCreatedAt).slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [items]);

  const toggle = (id: string) =>
    setSelection((s) => {
      const next = new Set(s ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size ? next : null;
    });

  const dismissTip = () => {
    setTipHidden(true);
    try {
      localStorage.setItem(TIP_KEY, "1");
    } catch {
      // Shown again next time; harmless.
    }
  };

  const thisYear = new Date().getFullYear();
  const monthTitle = (key: string) => {
    const d = `${key}-15T12:00:00Z`;
    return Number(key.slice(0, 4)) === thisYear ? fmt.date(d, { month: "long" }) : fmt.monthYear(d);
  };

  return (
    <div className="flex flex-col w-full gap-space-md">
      <div className="flex flex-col gap-4 w-full mb-1">
        <MomentsTitle view="media" />
        <MomentFilterBar filters={filters} onChange={setFilters} withText={false} />
      </div>

      {/* The Media Library comes with a Parent or Family Circle (originals are kept either way). */}
      {kids.length > 0 && kids.every((c) => c.tier === "FREE") && <PlanNotice text={t("gallery.needsCircle")} />}

      {selection && (
        <div
          role="toolbar"
          aria-label={t("gallery.selectionBar")}
          className="sticky top-20 z-30 flex items-center justify-between px-space-md py-2.5 bg-tertiary-fixed text-on-tertiary-fixed rounded-2xl shadow-[0_4px_16px_rgba(22,26,24,0.06)]"
        >
          <div className="flex items-center gap-2">
            <button type="button" aria-label={t("gallery.cancelSelection")} onClick={() => setSelection(null)} className="flex">
              <Icon name="close" className="text-[18px]" />
            </button>
            <span className="font-label-sm text-label-sm font-semibold">{t("gallery.selected", { count: selection.size })}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelection(new Set(items.map((i) => i.id)))} className="font-label-sm text-label-sm text-on-tertiary-fixed-variant underline">
              {t("gallery.selectAll")}
            </button>
            <button
              type="button"
              onClick={() => navigate(`${paths.media.download()}?ids=${[...selection].join(",")}`)}
              className="px-2.5 py-1 rounded-full bg-primary-container text-on-primary font-label-sm text-label-sm flex items-center gap-1 active:scale-95 transition-transform"
            >
              <Icon name="cloud_download" className="text-[14px]" />
              <span>{t("gallery.download")}</span>
            </button>
          </div>
        </div>
      )}

      {!tipHidden && items.length > 0 && (
        <div className="relative p-space-md bg-secondary-container/40 rounded-2xl flex items-start gap-space-sm shadow-[0_2px_12px_rgba(22,26,24,0.03)]">
          <div className="w-8 h-8 rounded-full bg-surface-container-lowest flex items-center justify-center shrink-0 shadow-[0_2px_6px_rgba(22,26,24,0.05)] text-secondary">
            <Icon name="info" className="text-[18px]" />
          </div>
          <div className="flex flex-col gap-0.5 pr-6 flex-1 min-w-0">
            <span className="font-label-sm text-label-sm font-semibold text-on-secondary-fixed">{t("gallery.tipTitle")}</span>
            <p className="font-body-md text-body-md text-on-secondary-fixed-variant leading-snug">{t("gallery.tipBody")}</p>
          </div>
          <button
            aria-label={t("gallery.dismissTip")}
            type="button"
            onClick={dismissTip}
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-on-secondary-fixed-variant hover:bg-surface-container-highest/50 active:scale-95 transition-all"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl bg-surface-container-low" />
          ))}
        </div>
      )}
      {!isLoading && items.length === 0 && (
        <EmptyCard icon="photo_library" text={t("gallery.empty")} to={paths.moments.create()} action={t("feed.share")} />
      )}

      {months.map(([key, list], i) => {
        const photos = list.filter((x) => x.type === "IMAGE").length;
        const videos = list.length - photos;
        return (
          <section key={key} className={cn("flex flex-col gap-space-xs", i > 0 && "mt-2")}>
            <div className="flex items-baseline justify-between px-1">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">{monthTitle(key)}</h2>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {[photos && t("gallery.photos", { count: photos }), videos && t("gallery.videos", { count: videos })].filter(Boolean).join(", ")}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {list.map((item) => (
                <Tile
                  key={item.id}
                  item={item}
                  selecting={selection !== null}
                  selected={selection?.has(item.id) ?? false}
                  onOpen={() => navigate(paths.media.viewer(item.id))}
                  onToggle={() => toggle(item.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Tile({
  item,
  selecting,
  selected,
  onOpen,
  onToggle,
}: {
  item: MomentMediaDto;
  selecting: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const { t } = useT("moments");
  const timer = useRef<number | null>(null);
  // A long press starts selection; the click that follows the release must
  // not immediately undo it (the legacy app's self-deselect bug).
  const suppressClick = useRef(false);

  const start = () => {
    suppressClick.current = false;
    timer.current = window.setTimeout(() => {
      suppressClick.current = true;
      if (!selecting || !selected) onToggle();
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
  };
  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <button
      type="button"
      aria-pressed={selecting ? selected : undefined}
      aria-label={t(item.type === "VIDEO" ? "gallery.video" : "gallery.photo", { title: item.postTitle })}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (selecting) onToggle();
        else onOpen();
      }}
      className={cn(
        "group relative aspect-square rounded-2xl overflow-hidden bg-surface-container-low shadow-[0_2px_8px_rgba(22,26,24,0.04)] cursor-pointer active:scale-[0.98] transition-transform select-none [-webkit-touch-callout:none]",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
      )}
    >
      <img alt="" loading="lazy" draggable={false} src={mediaUrl(item.id)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
      {item.type === "VIDEO" && <DurationBadge seconds={item.durationSeconds} />}
      {selecting && (
        <div
          className={cn(
            "absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center backdrop-blur-sm shadow-sm",
            selected ? "bg-surface-container-lowest/90 text-on-surface" : "border-2 border-surface-container-lowest/90 bg-black/10",
          )}
        >
          {selected && <Icon name="check" className="text-[14px]" />}
        </div>
      )}
      {item.type === "IMAGE" && (
        <div className="absolute inset-0 bg-gradient-to-t from-primary-container/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
          <span className="font-micro-meta text-micro-meta text-surface-bright truncate">{item.postTitle}</span>
        </div>
      )}
    </button>
  );
}
