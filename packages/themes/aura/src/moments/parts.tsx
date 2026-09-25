import type { ChildFamilyMember } from "@kinnd/shared";
import {
  dateKey,
  addDays,
  MOMENT_TYPES,
  paths,
  useCategories,
  useFormat,
  useNavigate,
  useT,
  type MomentFilters,
} from "@kinnd/core";

import { useCategoryName } from "../calendar/people";
import { menuContentClass } from "../calendar/Sections";
import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

// Pieces shared by the Moments feed and the Media gallery
// (kinnd_moments_feed_1, kinnd_media_gallery): the title row with the
// Feed/Media switch, the Categories/Types filters, author and time labels.

type MomentsView = "feed" | "media";

const pill =
  "inline-flex items-center bg-surface-container-lowest rounded-full shadow-[0_2px_8px_rgba(22,26,24,0.06)] text-label-md font-semibold text-on-surface active:scale-95 transition-transform";

export function MomentsTitle({ view }: { view: MomentsView }) {
  const { t } = useT("moments");
  const navigate = useNavigate();
  const views: { id: MomentsView; icon: string; to: string }[] = [
    { id: "feed", icon: "view_agenda", to: paths.moments.feed() },
    { id: "media", icon: "photo_library", to: paths.media.gallery() },
  ];
  const current = views.find((v) => v.id === view)!;
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-[32px] font-bold text-on-surface tracking-tight leading-none">{t("title")}</h1>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(pill, "gap-1.5 px-3.5 py-1.5 group")}>
          <Icon name={current.icon} className="text-[16px] text-on-surface" />
          <span>{t(`views.${view}`)}</span>
          <Icon name="expand_more" className="text-[16px] text-on-surface-variant transition-transform group-data-[state=open]:rotate-180" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className={cn(menuContentClass, "w-44")}>
          <DropdownMenuLabel className="px-2.5 py-1.5 text-micro-meta uppercase tracking-wider text-secondary font-semibold">
            {t("views.switch")}
          </DropdownMenuLabel>
          {views.map((v) => (
            <DropdownMenuItem
              key={v.id}
              role="menuitemradio"
              aria-checked={v.id === view}
              onSelect={() => navigate(v.to)}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-label-sm text-on-surface focus:bg-surface-container-low",
                v.id === view ? "font-semibold bg-surface-container-low" : "font-medium",
              )}
            >
              <Icon name={v.icon} className={cn("text-[16px]", v.id === view ? "text-primary" : "text-secondary")} />
              {t(`views.${v.id}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const checkItem = "px-2.5 py-1.5 pl-8 rounded-xl text-label-sm font-medium text-on-surface focus:bg-surface-container-low";
const TYPE_ICON = { photo: "photo_camera", video: "videocam", text: "notes" } as const;

export function MomentFilterBar({
  filters,
  onChange,
  withText = true,
}: {
  filters: MomentFilters;
  onChange: (f: MomentFilters) => void;
  /** The gallery has no "words only" type */
  withText?: boolean;
}) {
  const { t } = useT("moments");
  const { data: categories = [] } = useCategories();
  const name = useCategoryName();
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const types = MOMENT_TYPES.filter((x) => withText || x !== "text");
  const count = (n: number) =>
    n > 0 && (
      <span className="w-4 h-4 rounded-full bg-surface-container-high text-[11px] font-bold flex items-center justify-center text-on-surface shrink-0">{n}</span>
    );

  return (
    <div className="w-full flex gap-2.5 items-center">
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(pill, "flex-1 justify-between px-3.5 py-2 min-w-0")}>
          <div className="flex items-center gap-1.5 truncate">
            <Icon name="tune" className="text-[18px] text-on-surface" />
            <span className="truncate">{t("filters.categories")}</span>
            {count(filters.categoryIds.length)}
          </div>
          <Icon name="expand_more" className="text-[16px] text-on-surface-variant" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={cn(menuContentClass, "w-56 max-h-80")}>
          {categories
            .filter((c) => !c.archived)
            .map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                className={checkItem}
                checked={filters.categoryIds.includes(c.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onChange({ ...filters, categoryIds: toggle(filters.categoryIds, c.id) })}
              >
                <Icon name={c.icon} className="text-[16px] text-secondary" />
                {name(c)}
              </DropdownMenuCheckboxItem>
            ))}
          {filters.categoryIds.length > 0 && (
            <DropdownMenuItem className={cn(checkItem, "text-secondary")} onSelect={() => onChange({ ...filters, categoryIds: [] })}>
              {t("filters.clear")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className={cn(pill, "flex-1 justify-between px-3.5 py-2 min-w-0")}>
          <div className="flex items-center gap-1.5 truncate">
            <Icon name="category" className="text-[18px] text-on-surface" />
            <span className="truncate">{t("filters.types")}</span>
            {count(filters.types.filter((x) => types.includes(x)).length)}
          </div>
          <Icon name="expand_more" className="text-[16px] text-on-surface-variant" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={cn(menuContentClass, "w-48")}>
          {types.map((type) => (
            <DropdownMenuCheckboxItem
              key={type}
              className={checkItem}
              checked={filters.types.includes(type)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onChange({ ...filters, types: toggle(filters.types, type) })}
            >
              <Icon name={TYPE_ICON[type]} className="text-[16px] text-secondary" />
              {t(`filters.type.${type}`)}
            </DropdownMenuCheckboxItem>
          ))}
          {filters.types.length > 0 && (
            <DropdownMenuItem className={cn(checkItem, "text-secondary")} onSelect={() => onChange({ ...filters, types: [] })}>
              {t("filters.clear")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** "Charlie (Dad)" — the author with their relationship to the (first) tagged child. */
export function useAuthorLabel() {
  const { t } = useT("moments");
  return (authorId: string, authorName: string, members: ChildFamilyMember[] | undefined) => {
    const m = members?.find((x) => x.userId === authorId);
    if (!m) return authorName.split(" ")[0] || authorName;
    return t("author", { name: m.firstName, relationship: t(`calendar:people.relationship.${m.relationship}`) });
  };
}

/** "Today, 14:20" · "Yesterday, 16:45" · "Thursday" (this week) · "Sep 3, 2026". */
export function useWhenLabel() {
  const { t } = useT("moments");
  const fmt = useFormat();
  return (iso: string) => {
    const day = dateKey(iso);
    const today = dateKey();
    if (day === today) return t("when.today", { time: fmt.time(iso) });
    if (day === addDays(today, -1)) return t("when.yesterday", { time: fmt.time(iso) });
    if (day > addDays(today, -7)) return fmt.date(iso, { weekday: "long" });
    return fmt.date(iso);
  };
}

/** "0:42" */
export const formatDuration = (seconds: number | null | undefined) => {
  if (seconds == null) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The gallery's video badge: ▶ 0:42 */
export function DurationBadge({ seconds, className }: { seconds: number | null; className?: string }) {
  return (
    <div className={cn("absolute bottom-2 right-2 bg-primary-container/85 backdrop-blur-md px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm", className)}>
      <Icon name="play_arrow" filled className="text-[12px] text-surface-bright" />
      {seconds != null && <span className="font-micro-meta text-micro-meta text-surface-bright font-semibold">{formatDuration(seconds)}</span>}
    </div>
  );
}
