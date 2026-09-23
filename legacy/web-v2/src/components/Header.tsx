import type { ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import { HeaderChildCluster } from "./HeaderChildCluster";
import { useAuth } from "../lib/AuthContext";
import { useHeaderContextValue } from "../lib/HeaderContext";
import { useUnreadMessages } from "../lib/useUnreadMessages";

// Every in-app page renders through exactly one of three header modes,
// decided by the current path:
//
// - Tab roots (the 4 bottom-nav destinations) get the persistent bar from
//   the mockups (docs/Themes/Aura/kidcom_today_screen_updated_note,
//   kidcom_children, kidcom_calendar_1, kidcom_lists — identical markup
//   across all of them): self-avatar on the far left (-> /profile), a
//   search entry point (-> /search, a real RLS-scoped search across
//   children/moments/lists — see apps/api/src/routes/search), a
//   notification bell (-> /activity, a real aggregation of pending swap/
//   event requests and unread threads — there's no notification-log table
//   to back a literal inbox, see ActivityPage.tsx's own note), and a
//   child-avatar cluster (-> /kids, see HeaderChildCluster.tsx). There's no
//   app icon/title text in any of these mockups — the tab name is
//   screen-reader-only there too.
// - Child sub-pages (profile, medical, contacts) get the lighter
//   back-chevron + title + avatar bar.
// - Every other in-app page (including /kids itself now) feeds this same
//   lighter bar a title/back-target/optional right-side action via
//   useHeaderConfig (see HeaderContext.tsx) instead of building its own
//   local header.
const TAB_TITLES: Record<string, string> = {
  "/": "Today",
  "/calendar": "Calendar",
  "/journal": "Moments",
  "/lists": "Lists",
};

const CHILD_SUBPAGE_TITLES: Array<{ suffix: string; title: string }> = [
  { suffix: "/medical", title: "Medical Info" },
  { suffix: "/contacts", title: "Emergency Contacts" },
  { suffix: "/growth", title: "Growth" },
];

function SubpageHeader({
  title,
  onBack,
  rightAction,
}: {
  title: string;
  onBack: () => void;
  rightAction?: ReactNode;
}) {
  const { user } = useAuth();
  return (
    <div className="sticky top-0 z-40 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="h-16 px-container-padding flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            aria-label="Back"
            className="w-10 h-10 flex items-center justify-center shrink-0 -ml-2"
          >
            <Icon name="chevron_left" className="text-on-surface-variant" />
          </button>
          <span className="font-headline-md text-headline-md text-on-surface truncate">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-element-gap shrink-0">
          {rightAction}
          <Link to="/profile" aria-label="Profile">
            <Avatar name={user?.firstName ?? "?"} avatarAssetId={user?.avatarUrl} kind="adult" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ childId?: string }>();
  const { user, children } = useAuth();
  const { config } = useHeaderContextValue();
  const hasUnreadMessages = useUnreadMessages();
  const path = location.pathname;

  if (path in TAB_TITLES) {
    return (
      <div className="sticky top-0 z-40 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-20 px-gutter flex items-center justify-between gap-2">
          <Link to="/profile" aria-label="Profile" className="shrink-0">
            <Avatar name={user?.firstName ?? "?"} avatarAssetId={user?.avatarUrl} kind="adult" />
          </Link>
          <Link
            to="/search"
            aria-label="Search"
            className="flex-1 min-w-0 max-w-xs flex items-center gap-2 h-10 px-3 rounded-full bg-surface-container-lowest shadow-[0_1px_6px_rgba(0,0,0,0.03)] text-on-surface-variant/70"
          >
            <Icon name="search" className="text-[18px] shrink-0" />
            <span className="font-label-sm text-label-sm truncate">Search…</span>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/activity"
              aria-label="Activity"
              className="relative w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <Icon name="notifications" className="text-[22px]" />
              {hasUnreadMessages && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-secondary" />
              )}
            </Link>
            <HeaderChildCluster children={children} />
          </div>
        </div>
      </div>
    );
  }

  if (params.childId) {
    const childSubpage = CHILD_SUBPAGE_TITLES.find((s) => path.endsWith(s.suffix));
    const isChildProfileRoot = path === `/children/${params.childId}`;
    if (childSubpage || isChildProfileRoot) {
      const child = children.find((c) => c.id === params.childId);
      const title = childSubpage?.title ?? (child ? `${child.firstName}'s Profile` : "Child Profile");
      return <SubpageHeader title={title} onBack={() => navigate(-1)} />;
    }
  }

  if (config) {
    return (
      <SubpageHeader
        title={config.title}
        onBack={() => (config.backTo ? navigate(config.backTo) : navigate(-1))}
        rightAction={config.rightAction}
      />
    );
  }

  return null;
}
