import { NavLink } from "react-router-dom";

import { Icon } from "./Icon";

// Mirrors docs/Themes/Aura/kidcom_children/code.html's nav: Today, Calendar,
// Moments, Lists — applied globally (all skins), not just Aura. Kids and the
// user's own profile/settings dropped off this bar; both stay reachable via
// the header's child-avatar cluster and avatar respectively (see
// HeaderChildCluster.tsx / Header.tsx). Growth lives under each child's
// profile (see ChildProfilePage).
const NAV_ITEMS = [
  { to: "/", label: "Today", icon: "sunny", end: true },
  { to: "/calendar", label: "Calendar", icon: "calendar_month" },
  { to: "/journal", label: "Moments", icon: "photo_library" },
  { to: "/lists", label: "Lists", icon: "format_list_bulleted" },
] as const;

// Shape (edge-to-edge bar vs. floating pill), color, and label visibility
// all come from the --nav-* / --color-nav-* tokens in index.css, so a skin
// restyles this bar entirely by overriding variables under
// `[data-skin="<id>"]` — no per-skin branching here. Greenkeeper's values
// reproduce today's bar exactly; Sky and Aura float it as a pill with
// icon-only items and an active-item chip.
//
// Positioning (fixed-to-viewport, safe-area padding) lives one level up in
// AppShell.tsx, which lays this out in a row next to QuickAddButton — this
// component now only owns its own shape/color, not where it sits.
export function BottomNav() {
  return (
    <nav
      className="flex-1 min-w-0 bg-nav-surface/90 backdrop-blur-xl transition-[border-radius,box-shadow] duration-300"
      style={{
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
                <span className="relative w-10 h-10 rounded-full flex items-center justify-center">
                  {/* Decorative background layer, separate from the icon — the icon
                      used to be nested inside this and inherited its opacity, so it
                      went invisible (not just chip-less) whenever the chip faded to 0
                      for an inactive item on every skin, not just Sky. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-nav-active-chip transition-opacity duration-300"
                    style={{ opacity: isActive ? "var(--nav-active-chip-opacity)" : 0 }}
                  />
                  <Icon
                    name={item.icon}
                    className={`relative z-10 ${isActive ? "text-nav-icon-active" : "text-nav-icon"}`}
                  />
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
