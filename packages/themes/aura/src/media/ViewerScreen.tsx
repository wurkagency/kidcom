import { useEffect, useRef, useState } from "react";
import type { MediaInfoDto } from "@kinnd/shared";
import {
  mediaDownloadUrl,
  mediaPlaybackUrl,
  mediaUrl,
  paths,
  useActiveChildren,
  useCategoryMap,
  useFormat,
  useMediaInfo,
  useNavigate,
  useParams,
  useT,
  useToggleBookmark,
} from "@kinnd/core";

import { useCategoryName } from "../calendar/people";
import { menuContentClass, menuItemClass } from "../calendar/Sections";
import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { AppHeader } from "../shells/AppHeader";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { clock, formatBytes, formatLabel, resolutionClass } from "./format";

// kinnd_preview (photo), kinnd_video_preview (video) and
// kinnd_media_viewer_player (details sheet): the dark viewer under the
// base header, swiping through the moment's photos and videos.

const roundButton =
  "w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-all";

export function ViewerScreen() {
  const { t } = useT("moments");
  const navigate = useNavigate();
  const { mediaId } = useParams();
  const { data: info, isError } = useMediaInfo(mediaId);
  const bookmark = useToggleBookmark();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ids = info?.moment?.mediaIds ?? (mediaId ? [mediaId] : []);
  const index = Math.max(0, ids.indexOf(mediaId ?? ""));

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(paths.moments.feed()));
  const goTo = (i: number) => {
    const id = ids[i];
    if (id && id !== mediaId) navigate(paths.media.viewer(id), { replace: true });
  };

  return (
    <div className="min-h-screen bg-viewer font-body-md text-on-surface">
      <AppHeader />
      {/* pt-20: under the 000_base_scaffold header (h-20); the exports assumed an older, shorter one. */}
      <main className="flex flex-col relative w-full bg-viewer min-h-screen pt-20 overflow-hidden pb-safe">
        <div className={cn("flex flex-col w-full relative pt-2", detailsOpen ? "min-h-[calc(100dvh-5rem)]" : "flex-1 h-[calc(100dvh-5rem)] justify-between px-0.5 pb-safe")}>
          {/* Top bar */}
          <div className="flex items-center justify-between z-20 py-2 px-margin">
            <div className="flex items-center gap-2">
              <button type="button" aria-label={t("viewer.back")} onClick={back} className={roundButton}>
                <Icon name="arrow_back" className="text-[20px]" />
              </button>
              {ids.length > 0 && (
                <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-white font-label-md text-xs flex items-center gap-1.5">
                  <Icon name={info?.type === "VIDEO" ? "videocam" : "photo_library"} className="text-[15px] text-viewer-accent" />
                  <span>{t("viewer.position", { n: index + 1, total: ids.length })}</span>
                </div>
              )}
            </div>
            {info && (
              <div className="flex items-center gap-2">
                <a href={mediaDownloadUrl(info.id)} download title={t("viewer.download")} aria-label={t("viewer.download")} className={roundButton}>
                  <Icon name="download" className="text-[19px]" />
                </a>
                <button
                  type="button"
                  title={t("actions.bookmark")}
                  aria-label={t("actions.bookmark")}
                  aria-pressed={info.bookmarkedByMe}
                  onClick={() => bookmark.mutate({ mediaAssetId: info.id, bookmarked: !info.bookmarkedByMe })}
                  className={roundButton}
                >
                  <Icon name={info.bookmarkedByMe ? "bookmark" : "bookmark_border"} filled={info.bookmarkedByMe} className="text-[19px]" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger title={t("viewer.more")} aria-label={t("viewer.more")} className={roundButton}>
                    <Icon name="more_vert" className="text-[19px]" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className={cn(menuContentClass, "w-48")}>
                    <DropdownMenuItem className={menuItemClass} onSelect={() => setDetailsOpen(true)}>
                      <Icon name="info" className="text-[16px] text-secondary" />
                      {t("viewer.details")}
                    </DropdownMenuItem>
                    {info.moment && (
                      <DropdownMenuItem className={menuItemClass} onSelect={() => navigate(paths.moments.detail(info.moment!.childIds[0]!, info.moment!.id))}>
                        <Icon name="view_agenda" className="text-[16px] text-secondary" />
                        {t("viewer.openMoment")}
                      </DropdownMenuItem>
                    )}
                    {ids.length > 1 && (
                      <DropdownMenuItem className={menuItemClass} onSelect={() => navigate(`${paths.media.download()}?ids=${ids.join(",")}`)}>
                        <Icon name="cloud_download" className="text-[16px] text-secondary" />
                        {t("viewer.downloadAll")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {isError ? (
            <p className="flex-1 flex items-center justify-center text-white/70 font-body-md text-body-md px-margin text-center">{t("viewer.notFound")}</p>
          ) : (
            <Stage info={info} ids={ids} index={index} onIndex={goTo} compact={detailsOpen} />
          )}

          {info && detailsOpen ? (
            <Details info={info} onClose={() => setDetailsOpen(false)} />
          ) : (
            info?.moment && <Caption info={info} onDetails={() => setDetailsOpen(true)} />
          )}
        </div>
      </main>
    </div>
  );
}

function Stage({
  info,
  ids,
  index,
  onIndex,
  compact,
}: {
  info: MediaInfoDto | undefined;
  ids: string[];
  index: number;
  onIndex: (i: number) => void;
  /** With the details drawer open the media sits at its natural height (kinnd_media_viewer_player). */
  compact: boolean;
}) {
  const { t } = useT("moments");
  const touchX = useRef<number | null>(null);
  const isVideo = info?.type === "VIDEO";

  const dots = ids.length > 1 && (
    <div className={cn("flex items-center justify-center gap-1.5 z-10 pointer-events-none", isVideo || compact ? (compact ? "mt-2.5" : "pt-3") : "absolute bottom-3 inset-x-0")}>
      {ids.map((id, i) => (
        <span key={id} className={cn("h-1.5 rounded-full shadow-sm transition-all", i === index ? "w-5 bg-viewer-accent" : "w-1.5 bg-white/40")} />
      ))}
    </div>
  );

  return (
    <div
      className={cn("relative flex flex-col items-center justify-center my-2 w-full min-h-0", compact ? "px-0.5" : "flex-1")}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start == null || end == null || Math.abs(end - start) < 50) return;
        onIndex(end < start ? Math.min(ids.length - 1, index + 1) : Math.max(0, index - 1));
      }}
    >
      {!info ? (
        <div className="w-full flex-1 rounded-2xl bg-black/50 animate-pulse" />
      ) : isVideo ? (
        <>
          <VideoPlayer key={info.id} info={info} />
          {dots}
        </>
      ) : (
        <>
          <div className={cn("relative flex items-center justify-center overflow-hidden bg-black/50 shadow-2xl min-h-0 w-full", compact ? "aspect-[4/3]" : "flex-1 rounded-2xl")}>
            <img alt={info.moment?.title ?? ""} src={mediaUrl(info.id)} className="w-full h-full select-none object-contain" draggable={false} />
            {!compact && dots}
          </div>
          {compact && dots}
        </>
      )}
      {ids.length > 1 && (
        <>
          {index > 0 && (
            <button type="button" aria-label={t("media.previous")} onClick={() => onIndex(index - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center">
              <Icon name="chevron_left" className="text-[20px]" />
            </button>
          )}
          {index < ids.length - 1 && (
            <button type="button" aria-label={t("media.next")} onClick={() => onIndex(index + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center">
              <Icon name="chevron_right" className="text-[20px]" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** The export's player: scrubber, play/pause, time, volume, fullscreen. */
function VideoPlayer({ info }: { info: MediaInfoDto }) {
  const { t } = useT("moments");
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(info.durationSeconds ?? 0);
  const progress = duration ? Math.min(1, time / duration) : 0;

  useEffect(() => {
    const v = video.current;
    return () => v?.pause();
  }, []);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };
  const seek = (clientX: number, el: HTMLElement) => {
    const v = video.current;
    if (!v || !duration) return;
    const r = el.getBoundingClientRect();
    v.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration;
  };

  return (
    <div ref={frame} className="relative w-full aspect-video bg-black overflow-hidden flex items-center justify-center shadow-2xl">
      <video
        ref={video}
        src={mediaPlaybackUrl(info.id)}
        poster={mediaUrl(info.id)}
        playsInline
        preload="metadata"
        muted={muted}
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        className="absolute inset-0 w-full h-full object-contain"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 pointer-events-none" />
      {!playing && (
        <button type="button" aria-label={t("viewer.play")} onClick={toggle} className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-all shadow-lg hover:bg-black/60">
          <Icon name="play_arrow" className="text-[32px]" />
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 z-20 p-3 pt-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col gap-2">
        <div
          role="slider"
          tabIndex={0}
          aria-label={t("viewer.seek")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          onClick={(e) => seek(e.clientX, e.currentTarget)}
          onKeyDown={(e) => {
            const v = video.current;
            if (!v) return;
            if (e.key === "ArrowRight") v.currentTime = Math.min(duration, v.currentTime + 5);
            if (e.key === "ArrowLeft") v.currentTime = Math.max(0, v.currentTime - 5);
          }}
          className="relative w-full flex items-center cursor-pointer py-1"
        >
          <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden relative">
            <div className="h-full bg-tertiary-fixed rounded-full" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="absolute w-2.5 h-2.5 bg-white rounded-full shadow-md" style={{ left: `${progress * 100}%`, transform: "translateX(-50%)" }} />
        </div>
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <button type="button" aria-label={t(playing ? "viewer.pause" : "viewer.play")} onClick={toggle} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center text-white transition-all active:scale-95">
              <Icon name={playing ? "pause" : "play_arrow"} filled className="text-[18px]" />
            </button>
            <span className="font-mono text-xs text-white/90 tracking-tight">{t("viewer.time", { time: clock(time), duration: clock(duration) })}</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label={t(muted ? "viewer.unmute" : "viewer.mute")} onClick={() => setMuted(!muted)} className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white/90 transition-all active:scale-95">
              <Icon name={muted ? "volume_off" : "volume_up"} className="text-[18px]" />
            </button>
            <button
              type="button"
              aria-label={t("viewer.fullscreen")}
              onClick={() => {
                const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
                if (frame.current?.requestFullscreen) void frame.current.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.());
                else v?.webkitEnterFullscreen?.();
              }}
              className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white/90 transition-all active:scale-95"
            >
              <Icon name="fullscreen" className="text-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Caption({ info, onDetails }: { info: MediaInfoDto; onDetails: () => void }) {
  const { t } = useT("moments");
  const fmt = useFormat();
  const { children: kids } = useActiveChildren();
  const m = info.moment!;
  const tagged = kids.filter((k) => m.childIds.includes(k.id));
  return (
    <button type="button" onClick={onDetails} className="flex flex-col gap-2.5 z-20 pt-2 pb-4 px-margin bg-gradient-to-t from-viewer via-viewer/90 to-transparent mt-auto text-left">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {tagged.map((k) => (
            <span key={k.id} className="px-2.5 py-0.5 rounded-full bg-viewer-accent/20 text-viewer-accent border border-viewer-accent/30 font-label-sm text-[11px] font-semibold flex items-center gap-1">
              <PersonAvatar mediaId={k.profileImageUrl} initials={k.firstName.charAt(0)} className="w-4 h-4 text-[8px]" />
              <span>{k.firstName}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 text-white/60 text-xs">
          <Icon name="schedule" className="text-[14px]" />
          <span>{fmt.time(m.createdAt)}</span>
        </div>
      </div>
      <div>
        <h2 className="font-title-md text-title-md text-white font-semibold leading-tight tracking-tight">{m.title}</h2>
        <p className="font-label-sm text-xs text-white/70 flex items-center gap-1 mt-1 flex-wrap">
          {m.location && (
            <>
              <Icon name="location_on" className="text-[14px] text-viewer-accent" />
              <span>{m.location}</span>
              <span className="text-white/30">•</span>
            </>
          )}
          <span>{t("viewer.by", { name: m.authorName.split(" ")[0] })}</span>
        </p>
      </div>
    </button>
  );
}

/** The export's white drawer under the media: title, category, author, format, size, download. */
function Details({ info, onClose }: { info: MediaInfoDto; onClose: () => void }) {
  const { t } = useT("moments");
  const fmt = useFormat();
  const navigate = useNavigate();
  const categories = useCategoryMap();
  const categoryName = useCategoryName();
  const m = info.moment;
  const category = m?.categoryId ? categories.get(m.categoryId) : undefined;
  const resolution = resolutionClass(info.width, info.height);
  const tile = "bg-black/10 p-3 rounded-[18px] flex flex-col gap-1";

  return (
    <section
      aria-labelledby="media-details-title"
      className="w-full text-black rounded-t-[28px] p-space-lg flex flex-col gap-space-md shadow-2xl mt-3 relative pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] bg-surface-container-lowest"
    >
        <div className="w-10 h-1 rounded-full bg-black/20 mx-auto self-center -mt-1" />
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <h2 id="media-details-title" className="font-headline-sm text-headline-sm text-black leading-tight flex-1">{m?.title ?? t("viewer.details")}</h2>
            <button type="button" aria-label={t("viewer.closeDetails")} onClick={onClose} className="w-9 h-9 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-black active:scale-95 transition-all shrink-0">
              <Icon name="close" className="text-[20px]" />
            </button>
          </div>
          {category && (
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/10 text-black text-xs font-medium">
                <Icon name={category.icon} className="text-[16px]" />
                <span>{categoryName(category)}</span>
              </span>
            </div>
          )}
        </div>

        {m && (
          <button
            type="button"
            onClick={() => navigate(paths.moments.detail(m.childIds[0]!, m.id))}
            className="w-full bg-black/10 rounded-[20px] p-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <PersonAvatar mediaId={m.authorAvatarUrl} initials={m.authorName.split(" ").map((p) => p.charAt(0)).join("").slice(0, 2)} className="w-10 h-10 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-title-md text-title-md text-black font-semibold truncate">{m.authorName}</span>
                <div className="flex items-center gap-1 text-black mt-0.5 min-w-0">
                  <Icon name={m.location ? "location_on" : "schedule"} className="text-[15px] text-black" />
                  <span className="font-label-sm text-label-sm text-black font-medium truncate">
                    {m.location ?? fmt.date(m.occurredOn ? `${m.occurredOn}T12:00:00Z` : m.createdAt, { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                </div>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center text-black shrink-0">
              <Icon name="chevron_right" className="text-[18px]" />
            </div>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <div className={tile}>
            <div className="flex items-center gap-1.5 text-black">
              <Icon name={info.type === "VIDEO" ? "videocam" : "photo_camera"} className="text-[16px]" />
              <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">{t("viewer.format")}</span>
            </div>
            <span className="font-title-md text-title-md text-black font-medium">{formatLabel(info.type, info.codec, info.mimeType)}</span>
            {info.width && info.height && (
              <span className="font-micro-meta text-micro-meta text-black font-medium">
                {[resolution, `${info.width} x ${info.height}`].filter(Boolean).join(" • ")}
              </span>
            )}
          </div>
          <div className={tile}>
            <div className="flex items-center gap-1.5 text-black">
              <Icon name="straighten" className="text-[16px]" />
              <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">{t("viewer.size")}</span>
            </div>
            <span className="font-title-md text-title-md text-black font-medium">{formatBytes(fmt, info.optimizedBytes ?? info.originalBytes)}</span>
            <span className="font-micro-meta text-micro-meta text-black font-medium">{t("viewer.raw", { size: formatBytes(fmt, info.originalBytes) })}</span>
          </div>
        </div>
        <a href={mediaDownloadUrl(info.id)} download className="w-full bg-black text-white py-3 px-space-md rounded-full font-label-md font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm">
          <Icon name="download" className="text-[20px] text-white" />
          <span>{t("viewer.downloadMedia")}</span>
        </a>
    </section>
  );
}
