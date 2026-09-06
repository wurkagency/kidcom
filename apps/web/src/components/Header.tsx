import type { ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { Icon } from "./Icon";
import { useAuth } from "../lib/AuthContext";
import { useHeaderContextValue } from "../lib/HeaderContext";
import { fetchMediaUrl } from "../lib/media";
import { useEffect, useState } from "react";

// The mockups' fixed top bar (logo, page title, notification bell, avatar)
// never made it into AppShell — this fills that gap. Every in-app page now
// renders through exactly one of three modes, decided by the current path:
//
// - Tab roots (the 5 bottom-nav destinations) get the full bar from the
//   mockups: app icon + tab title, a bell (-> /messages, the closest thing
//   to a notification surface today — there's no notification inbox, see
//   chunk 8's explicit scope), and an avatar (-> /profile).
// - Child sub-pages (profile, medical, contacts) get the lighter
//   back-chevron + title + avatar bar.
// - Every other in-app page feeds this same lighter bar a title/back-target/
//   optional right-side action via useHeaderConfig (see HeaderContext.tsx)
//   instead of building its own local header.
const TAB_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/calendar": "Calendar",
  "/journal": "Journal",
  "/growth": "Growth",
  "/profile": "Profile",
};

const CHILD_SUBPAGE_TITLES: Array<{ suffix: string; title: string }> = [
  { suffix: "/medical", title: "Medical Info" },
  { suffix: "/contacts", title: "Emergency Contacts" },
];

function Avatar({ firstName, avatarUrl }: { firstName: string; avatarUrl?: string | null }) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!avatarUrl) {
      setResolvedUrl(null);
      return;
    }
    fetchMediaUrl(avatarUrl)
      .then((url) => {
        if (!cancelled) setResolvedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  if (resolvedUrl) {
    return (
      <img
        src={resolvedUrl}
        alt=""
        className="w-8 h-8 rounded-full object-cover shrink-0"
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed font-label-md text-label-md shrink-0">
      {firstName.charAt(0).toUpperCase()}
    </div>
  );
}

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
            <Avatar firstName={user?.firstName ?? "?"} avatarUrl={user?.avatarUrl} />
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
  const path = location.pathname;

  if (path in TAB_TITLES) {
    return (
      <div className="sticky top-0 z-40 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-16 px-container-padding flex items-center justify-between">
          <div className="flex items-center gap-element-gap">
            <img alt="KidCom" className="h-8 w-8 rounded-lg object-contain" src="/icons/icon-192.png" />
            <span className="font-headline-md text-headline-md text-on-surface">
              {TAB_TITLES[path]}
            </span>
          </div>
          <div className="flex items-center gap-element-gap">
            <Link
              to="/messages"
              aria-label="Messages"
              className="w-10 h-10 flex items-center justify-center"
            >
              <Icon name="notifications" className="text-on-surface-variant" />
            </Link>
            <Link to="/profile" aria-label="Profile">
              <Avatar firstName={user?.firstName ?? "?"} avatarUrl={user?.avatarUrl} />
            </Link>
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
