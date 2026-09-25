import { useEffect } from "react";
import type { NotificationDto, NotificationKind } from "@kidcom/shared";
import { paths, useFormat, useMarkNotificationsRead, useNotifications, useT } from "@kidcom/core";

import { EmptyCard } from "../calendar/Sections";
import { ScreenTitle } from "../components/ScreenTitle";
import { Skeleton } from "../ui/skeleton";
import { ListAvatar, ListRow, useListTime } from "./parts";

// Notifications: the Messages inbox layout (kidcom_messages_1) with
// read-only rows, newest first. New ones show tinted until the list has
// been seen; opening it marks everything read.

const KIND_ICON: Record<NotificationKind, string> = {
  "moment.shared": "photo_library",
  "event.created": "calendar_today",
  "event.requested": "event_upcoming",
  "event.decided": "event_available",
  "swap.requested": "swap_horiz",
  "swap.decided": "swap_horiz",
  "appointment.reminder": "alarm",
  "list.claimed": "checklist",
  "message.received": "chat",
  "upgrade.requested": "workspace_premium",
  "payment.failed": "credit_card_off",
  "child.suspended": "visibility_off",
  "child.deletion_warning": "delete_forever",
  "trial.ending": "event",
  "access.removed": "person_remove",
};

/** Params made readable: dates the country's way, status words translated. */
function useParamsText() {
  const { t } = useT("notifications");
  const fmt = useFormat();
  return (n: NotificationDto) => {
    const p = n.params;
    const date = typeof p.date === "string" ? fmt.date(`${p.date}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short" }) : "";
    const when =
      typeof p.startsAt === "string" ? (p.allDay ? fmt.date(p.startsAt, { weekday: "short", day: "numeric", month: "short" }) : `${fmt.weekdayDate(p.startsAt)}, ${fmt.time(p.startsAt)}`) : "";
    return {
      ...p,
      actor: p.actor ?? t("someone"),
      date,
      when,
      status: p.status === "APPROVED" ? t("approved") : t("declined"),
      tier: typeof p.tier === "string" ? t(`tiers.${p.tier}`, { defaultValue: p.tier }) : "",
    };
  };
}

export function NotificationsScreen() {
  const { t } = useT("notifications");
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const when = useListTime();
  const text = useParamsText();
  const items = (data?.pages ?? []).flatMap((p) => p.items);
  const unread = data?.pages[0]?.unreadCount ?? 0;

  // Seen: mark read once the list has loaded (rows keep their tint for this visit).
  const { mutate } = markRead;
  useEffect(() => {
    if (unread > 0) mutate();
  }, [unread, mutate]);

  return (
    <div className="flex flex-col w-full pb-28">
      <ScreenTitle>{t("title")}</ScreenTitle>
      <div className="flex flex-col gap-2.5">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[82px] rounded-2xl bg-surface-container-lowest" />)}
        {!isLoading && items.length === 0 && <EmptyCard icon="notifications" text={t("empty")} to={paths.preferences.notifications()} action={t("settings")} />}
        {items.map((n) => {
          const params = text(n);
          const actor = typeof n.params.actor === "string" ? n.params.actor : null;
          return (
            <ListRow
              key={n.id}
              avatar={
                actor ? (
                  <ListAvatar mediaId={n.actorAvatarUrl} initials={actor.charAt(0)} badge={KIND_ICON[n.kind]} />
                ) : (
                  <ListAvatar icon={KIND_ICON[n.kind]} badge={null} />
                )
              }
              title={t(`kinds.${n.kind}.title`, params)}
              time={when(n.createdAt)}
              text={t(`kinds.${n.kind}.body`, params)}
              unread={!n.read}
            />
          );
        })}
        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="self-center mt-2 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"
          >
            {t("more")}
          </button>
        )}
      </div>
    </div>
  );
}
