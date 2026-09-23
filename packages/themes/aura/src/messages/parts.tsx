import type { ReactNode } from "react";
import { addDays, dateKey, useFormat, useT } from "@kidcom/core";

import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";

// Shared by the Messages inbox (kidcom_messages_1) and the Notifications
// list, which borrows its layout.

/** Today: the time. Yesterday: "Yesterday". Older: the date, the country's way. */
export function useListTime() {
  const { t } = useT("messages");
  const fmt = useFormat();
  return (iso: string) => {
    const day = dateKey(iso);
    if (day === dateKey()) return fmt.time(iso);
    if (day === addDays(dateKey(), -1)) return t("yesterday");
    return fmt.date(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
  };
}

export function ListAvatar({ mediaId, initials, icon, badge = "family_restroom" }: { mediaId?: string | null; initials?: string; icon?: string; badge?: string | null }) {
  return (
    <div className="relative shrink-0">
      {icon ? (
        <div className="w-13 h-13 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-fixed shadow-xs">
          <Icon name={icon} className="text-[26px]" />
        </div>
      ) : (
        <PersonAvatar mediaId={mediaId} initials={initials ?? ""} className="w-13 h-13 shadow-xs" />
      )}
      {badge && (
        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed shadow-xs">
          <Icon name={badge} className="text-[12px]" />
        </span>
      )}
    </div>
  );
}

/** One row of the inbox layout: avatar, title + time, one line of text, unread count. */
export function ListRow({
  avatar,
  title,
  time,
  text,
  unread = 0,
  italic,
}: {
  avatar: ReactNode;
  title: string;
  time: string;
  text: string;
  unread?: number | boolean;
  italic?: boolean;
}) {
  const isUnread = unread === true || (typeof unread === "number" && unread > 0);
  return (
    <div
      className={cn(
        "flex items-start gap-3.5 p-3.5 rounded-2xl shadow-sm transition-all",
        isUnread ? "bg-unread-card border border-unread-card-border" : "bg-surface-container-lowest",
      )}
    >
      {avatar}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className={cn("font-title-md text-title-md truncate", isUnread ? "font-bold text-obsidian" : "text-on-surface")}>{title}</h3>
            {isUnread && <span className="w-2 h-2 rounded-full bg-unread-ink shrink-0" />}
          </div>
          <span className="shrink-0 text-secondary text-label-sm font-label-sm">{time}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={cn("font-body-md text-body-md truncate", isUnread ? "font-bold text-obsidian" : "text-secondary", italic && "italic")}>{text}</p>
          {typeof unread === "number" && unread > 0 && (
            <span className="min-w-5 h-5 px-1 rounded-full bg-unread-ink text-white text-[11px] font-bold flex items-center justify-center shrink-0">{unread}</span>
          )}
        </div>
      </div>
    </div>
  );
}
