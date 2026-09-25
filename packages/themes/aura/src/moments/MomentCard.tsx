import { useRef, useState, type ReactNode } from "react";
import type { ChildFamilyMember, MediaAssetDto, MomentDto } from "@kinnd/shared";
import { Link, mediaUrl, paths, useNavigate, useT, useToggleBookmark, useToggleReaction } from "@kinnd/core";

import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { DurationBadge, useAuthorLabel, useWhenLabel } from "./parts";

// The feed card from kinnd_moments_feed_1 (and the post in _2): a 4:3
// swipeable media strip with the "1/4" badge, chevron and dots, then author,
// time, title, story, and the like / comment / download / bookmark row.

const readyMedia = (m: MomentDto) => m.media.filter((x) => x.status === "READY");

export function MediaCarousel({ media, onOpen }: { media: MediaAssetDto[]; onOpen: (mediaId: string) => void }) {
  const { t } = useT("moments");
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const many = media.length > 1;
  const go = (i: number) => strip.current?.scrollTo({ left: i * strip.current.clientWidth, behavior: "smooth" });

  return (
    <div className="relative w-full aspect-[4/3] bg-surface-container-high overflow-hidden">
      <div
        ref={strip}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className="flex h-full w-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]"
      >
        {media.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(m.id)}
            aria-label={t(m.type === "VIDEO" ? "media.openVideo" : "media.openPhoto", { n: i + 1, total: media.length })}
            className="relative h-full w-full shrink-0 snap-center"
          >
            <img alt="" loading="lazy" src={mediaUrl(m.id)} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
            {m.type === "VIDEO" && <DurationBadge seconds={m.durationSeconds} className="bottom-3 right-3" />}
          </button>
        ))}
      </div>
      {many && (
        <>
          <div className="absolute top-3 right-3 z-10">
            <div className="bg-black/50 backdrop-blur-md text-white text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
              <Icon name="photo_library" className="text-[15px] leading-none" />
              <span>{t("media.position", { n: index + 1, total: media.length })}</span>
            </div>
          </div>
          {index < media.length - 1 && (
            <button
              type="button"
              aria-label={t("media.next")}
              onClick={() => go(index + 1)}
              className="absolute inset-y-0 right-2 my-auto h-7 w-7 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center shadow-sm"
            >
              <Icon name="chevron_right" className="text-[18px] leading-none" />
            </button>
          )}
          <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-1.5 z-10 pointer-events-none">
            {media.map((m, i) => (
              <span key={m.id} className={cn("h-1.5 rounded-full shadow-sm bg-white", i === index ? "w-4" : "w-1.5 bg-white/60")} />
            ))}
          </div>
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent opacity-40 pointer-events-none" />
    </div>
  );
}

export function MomentCard({
  moment,
  members,
  detail = false,
  children,
}: {
  moment: MomentDto;
  members: ChildFamilyMember[] | undefined;
  /** The post screen: no action row, a location line instead. */
  detail?: boolean;
  children?: ReactNode;
}) {
  const { t } = useT("moments");
  const navigate = useNavigate();
  const author = useAuthorLabel();
  const when = useWhenLabel();
  const react = useToggleReaction();
  const bookmark = useToggleBookmark();
  const media = readyMedia(moment);
  const childId = moment.childIds[0]!;
  const postPath = paths.moments.detail(childId, moment.id);
  const footerButton =
    "w-8 h-8 rounded-full bg-surface-container-low text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors active:scale-95";

  return (
    <article className="w-full bg-surface-container-lowest rounded-lg overflow-hidden shadow-[0_4px_24px_-2px_rgba(22,26,24,0.05)] flex flex-col transition-all duration-200">
      {media.length > 0 && <MediaCarousel media={media} onOpen={(id) => navigate(paths.media.viewer(id))} />}
      <div className="p-space-md flex flex-col gap-space-xs">
        <div className="flex items-center gap-2">
          <PersonAvatar
            mediaId={moment.authorAvatarUrl}
            initials={moment.authorName.split(" ").map((p) => p.charAt(0)).join("").slice(0, 2)}
            className="w-6 h-6 shadow-sm"
          />
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-label-sm text-label-sm text-on-surface font-semibold truncate">{author(moment.authorId, moment.authorName, members)}</span>
            <span className="text-on-surface-variant/40 text-xs">•</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant/80 shrink-0">{when(moment.createdAt)}</span>
            {!moment.familyVisible && <Icon name="lock" className="text-[14px] text-secondary" aria-label={t("parentsOnly")} />}
          </div>
        </div>
        {detail ? (
          <h1 className="font-title-md text-title-md text-on-surface pt-1 leading-tight tracking-tight">{moment.title}</h1>
        ) : (
          <Link to={postPath} className="font-title-md text-title-md text-on-surface pt-1 leading-tight tracking-tight">
            {moment.title}
          </Link>
        )}
        {moment.text && <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed whitespace-pre-line">{moment.text}</p>}

        {detail ? (
          moment.location && (
            <div className="flex flex-col gap-2 pt-1">
              <div className="h-px w-full bg-surface-variant" />
              <div className="flex items-center gap-1.5 text-xs text-secondary font-medium">
                <Icon name="location_on" className="text-[16px] text-secondary" />
                <span>{moment.location}</span>
              </div>
            </div>
          )
        ) : (
          <div className="pt-2 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                aria-pressed={moment.reactedByMe}
                aria-label={t("actions.love")}
                onClick={() => react.mutate(moment)}
                className={cn("flex items-center gap-1.5 transition-colors group", moment.reactedByMe ? "text-error" : "text-on-surface-variant hover:text-error")}
              >
                <Icon name="favorite" filled={moment.reactedByMe} className="text-[20px] group-hover:scale-110 transition-transform" />
                <span className="font-label-md text-label-md text-on-surface-variant">{moment.reactionCount}</span>
              </button>
              <Link to={postPath} aria-label={t("actions.comments")} className="flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface transition-colors">
                <Icon name="chat_bubble" className="text-[20px]" />
                <span className="font-label-md text-label-md">{moment.commentCount}</span>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {media.length > 0 && (
                <button
                  type="button"
                  title={t("actions.download")}
                  aria-label={t("actions.download")}
                  onClick={() => navigate(`${paths.media.download()}?ids=${media.map((m) => m.id).join(",")}`)}
                  className={footerButton}
                >
                  <Icon name="download" className="text-[18px]" />
                </button>
              )}
              <button
                type="button"
                title={t("actions.bookmark")}
                aria-label={t("actions.bookmark")}
                aria-pressed={moment.bookmarkedByMe}
                onClick={() => bookmark.mutate({ momentId: moment.id, bookmarked: !moment.bookmarkedByMe })}
                className={cn(footerButton, moment.bookmarkedByMe && "text-on-surface")}
              >
                <Icon name={moment.bookmarkedByMe ? "bookmark" : "bookmark_border"} filled={moment.bookmarkedByMe} className="text-[18px]" />
              </button>
            </div>
          </div>
        )}
        {children}
      </div>
    </article>
  );
}
