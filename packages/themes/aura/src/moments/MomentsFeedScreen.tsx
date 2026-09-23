import { useEffect, useRef } from "react";
import { paths, useActiveChildren, useFamilies, useMomentFilters, useMomentsFeed, useT } from "@kidcom/core";

import { EmptyCard } from "../calendar/Sections";
import { Icon } from "../components/Icon";
import { Skeleton } from "../ui/skeleton";
import { MomentCard } from "./MomentCard";
import { MomentFilterBar, MomentsTitle } from "./parts";

// kidcom_moments_feed_1: the family feed across the selected children,
// newest first, loading more as the end comes into view.

export function MomentsFeedScreen() {
  const { t } = useT("moments");
  const { filter, selected } = useActiveChildren();
  const { filters, setFilters } = useMomentFilters();
  const feed = useMomentsFeed(filter.kind === "all" ? null : selected.map((c) => c.id), filters);
  const moments = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const families = useFamilies(moments.map((m) => m.childIds[0]!));
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !feed.hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !feed.isFetchingNextPage) void feed.fetchNextPage();
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [feed]);

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <div className="flex flex-col gap-4 w-full mb-1">
        <MomentsTitle view="feed" />
        <MomentFilterBar filters={filters} onChange={setFilters} />
      </div>

      <div className="flex flex-col gap-space-lg">
        {feed.isLoading &&
          [0, 1].map((i) => <Skeleton key={i} className="w-full aspect-[4/5] rounded-lg bg-surface-container-lowest" />)}
        {!feed.isLoading && moments.length === 0 && (
          <EmptyCard icon="photo_library" text={t("feed.empty")} to={paths.moments.create()} action={t("feed.share")} />
        )}
        {moments.map((m) => (
          <MomentCard key={m.id} moment={m} members={families.get(m.childIds[0]!)} />
        ))}
        <div ref={sentinel} />

        {!feed.hasNextPage && moments.length > 0 && (
          <div className="flex flex-col items-center justify-center py-space-md text-center">
            <div className="w-10 h-10 rounded-full bg-secondary-container/40 flex items-center justify-center text-on-secondary-container mb-2">
              <Icon name="lock" className="text-[20px]" />
            </div>
            <p className="font-label-md text-label-md text-on-surface font-medium">{t("feed.privateTitle")}</p>
            <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">{t("feed.privateBody")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
