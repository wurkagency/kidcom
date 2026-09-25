import { Link, paths, useCurrentUser, useT, useUnreadNotificationCount } from "@kinnd/core";

import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { ChildSelector } from "./ChildSelector";

// The one app header (docs/design/aura/000_base_scaffold). Every screen with
// a header uses exactly this; per-screen header variants in other exports
// are intentionally not reproduced.
export function AppHeader() {
  const { t } = useT("shell");
  const me = useCurrentUser();
  const hasUnreadNotifications = useUnreadNotificationCount() > 0;

  return (
    <header className="fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="h-20 px-gutter flex items-center justify-between gap-space-xs">
        <div className="flex items-center gap-space-xs shrink-0">
          <Link
            to={paths.profile.menu()}
            aria-label={t("header.profile")}
            className="relative flex items-center justify-center w-11 h-11 rounded-full"
          >
            <PersonAvatar mediaId={me.avatarUrl} initials={`${me.firstName.charAt(0)}${me.lastName.charAt(0)}`} />
            <span className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-tertiary-fixed-dim ring-2 ring-surface-container-lowest" />
          </Link>
        </div>

        <div className="flex-1 min-w-0 max-w-xs px-space-xs">
          <Link
            to={paths.search()}
            aria-label={t("header.search")}
            className="flex items-center gap-space-xs h-10 px-space-sm rounded-full bg-surface-container-lowest shadow-[0_1px_6px_rgba(0,0,0,0.03)]"
          >
            <Icon name="search" className="text-secondary text-[18px]" />
            <span className="font-label-sm text-label-sm text-secondary truncate" />
          </Link>
        </div>

        <div className="flex items-center gap-space-xs shrink-0">
          <Link
            to={paths.notifications()}
            aria-label={t("header.notifications")}
            className="relative flex items-center justify-center w-11 h-11 rounded-full text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <Icon name="notifications" className="text-[22px]" />
            {hasUnreadNotifications && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-secondary" />
            )}
          </Link>
          <ChildSelector />
        </div>
      </div>
    </header>
  );
}
