import { NavLink } from "react-router-dom";

import { Icon } from "./Icon";

// Mirrors the bottom nav in docs/stitch_splitkid/shared_lists/code.html:
// Home, Calendar, Journal, Lists, Profile. Growth moved under each child's
// profile (see ChildProfilePage) — this nav slot is now Shared Lists.
// The final slot was later switched from Profile to Kids (see
// ChildrenOverviewPage) — the user's own profile/settings stays reachable
// via the header avatar on every tab root instead (see Header.tsx).
const NAV_ITEMS = [
  { to: "/", label: "Home", icon: "grid_view", end: true },
  { to: "/calendar", label: "Calendar", icon: "calendar_month" },
  { to: "/journal", label: "Journal", icon: "photo_library" },
  { to: "/lists", label: "Lists", icon: "format_list_bulleted" },
  { to: "/kids", label: "Kids", icon: "child_care" },
] as const;

// Shape (edge-to-edge bar vs. floating pill), color, and label visibility
// all come from the --nav-* / --color-nav-* tokens in index.css, so a skin
// restyles this bar entirely by overriding variables under
// `[data-skin="<id>"]` — no per-skin branching here. Greenkeeper's values
// reproduce today's bar exactly; Sky floats it as a pill with icon-only
// items and an active-item chip.
export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 pb-safe bg-nav-surface/90 backdrop-blur-xl transition-[margin,border-radius,box-shadow] duration-300"
      style={{
        margin: "0 var(--nav-inset-x) var(--nav-inset-bottom)",
        borderRadius: "var(--nav-radius)",
        boxShadow: "var(--nav-shadow)",
      }}
    >
      <div className="flex justify-between items-center h-20 px-container-padding">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            aria-label={item.label}
            className="flex flex-col items-center justify-center gap-1 flex-1"
          >
            {({ isActive }) => (
              <>
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-nav-active-chip transition-opacity duration-300"
                  style={{ opacity: isActive ? "var(--nav-active-chip-opacity)" : 0 }}
                >
                  <Icon name={item.icon} className={isActive ? "text-nav-icon-active" : "text-nav-icon"} />
                </span>
                <span
                  className={`font-label-sm text-label-sm transition-colors ${
                    isActive ? "text-nav-icon-active font-semibold" : "text-nav-icon"
                  }`}
                  style={{
                    opacity: "var(--nav-label-opacity)",
                    maxHeight: "var(--nav-label-max-height)",
                    overflow: "hidden",
                  }}
                >
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
