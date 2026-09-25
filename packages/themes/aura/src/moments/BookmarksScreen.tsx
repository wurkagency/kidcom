import { useState } from "react";
import { mediaUrl, paths, useBookmarks, useFamilies, useNavigate, useT } from "@kinnd/core";

import { EmptyCard } from "../calendar/Sections";
import { EditorTitle } from "../components/Form";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Skeleton } from "../ui/skeleton";
import { MomentCard } from "./MomentCard";
import { DurationBadge } from "./parts";

// Profile menu → Bookmarks (no Stitch export): the saved moments as feed
// cards and saved photos/videos as gallery tiles, behind DESIGN.md's
// segmented switcher.

const segmentedGroup = "w-full flex items-center p-1 rounded-full bg-surface-container/50 border border-outline-variant/30";

export function BookmarksScreen() {
  const { t } = useT("moments");
  const navigate = useNavigate();
  const { data, isLoading } = useBookmarks();
  const [tab, setTab] = useState<"moments" | "media">("moments");
  const moments = data?.moments ?? [];
  const media = data?.media ?? [];
  const families = useFamilies(moments.map((m) => m.childIds[0]!));

  return (
    <div className="flex flex-col w-full gap-space-lg pb-6">
      <EditorTitle>{t("bookmarks.title")}</EditorTitle>
      <ToggleGroup type="single" spacing={1} value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} className={segmentedGroup} aria-label={t("bookmarks.title")}>
        <ToggleGroupItem value="moments" variant="segmented" className="flex-1 h-9">
          {t("bookmarks.moments", { count: moments.length })}
        </ToggleGroupItem>
        <ToggleGroupItem value="media" variant="segmented" className="flex-1 h-9">
          {t("bookmarks.media", { count: media.length })}
        </ToggleGroupItem>
      </ToggleGroup>

      {isLoading && <Skeleton className="w-full aspect-[4/5] rounded-lg bg-surface-container-lowest" />}

      {!isLoading && tab === "moments" && (
        <div className="flex flex-col gap-space-lg">
          {moments.length === 0 && <EmptyCard icon="bookmark" text={t("bookmarks.emptyMoments")} to={paths.moments.feed()} action={t("bookmarks.browse")} />}
          {moments.map((m) => (
            <MomentCard key={m.id} moment={m} members={families.get(m.childIds[0]!)} />
          ))}
        </div>
      )}

      {!isLoading && tab === "media" && (
        <>
          {media.length === 0 && <EmptyCard icon="bookmark" text={t("bookmarks.emptyMedia")} to={paths.media.gallery()} action={t("bookmarks.browse")} />}
          <div className="grid grid-cols-3 gap-2">
            {media.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-label={t(item.type === "VIDEO" ? "gallery.video" : "gallery.photo", { title: item.postTitle })}
                onClick={() => navigate(paths.media.viewer(item.id))}
                className="group relative aspect-square rounded-2xl overflow-hidden bg-surface-container-low shadow-[0_2px_8px_rgba(22,26,24,0.04)] active:scale-[0.98] transition-transform"
              >
                <img alt="" loading="lazy" src={mediaUrl(item.id)} className="w-full h-full object-cover" />
                {item.type === "VIDEO" && <DurationBadge seconds={item.durationSeconds} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
