import { NavLink } from "react-router-dom";

import { Icon } from "./Icon";

// Mirrors the bottom nav in docs/stitch_splitkid/shared_lists/code.html:
// Home, Calendar, Journal, Lists, Profile. Growth moved under each child's
// profile (see ChildProfilePage) — this nav slot is now Shared Lists.
const NAV_ITEMS = [
  { to: "/", label: "Home", icon: "grid_view", end: true },
  { to: "/calendar", label: "Calendar", icon: "calendar_month" },
  { to: "/journal", label: "Journal", icon: "photo_library" },
  { to: "/lists", label: "Lists", icon: "format_list_bulleted" },
  { to: "/profile", label: "Profile", icon: "person" },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 pb-safe bg-surface-container/90 backdrop-blur-xl shadow-[0_-1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex justify-between items-center h-20 px-container-padding">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 flex-1 transition-colors ${
                isActive ? "text-primary font-semibold" : "text-on-surface-variant"
              }`
            }
          >
            <Icon name={item.icon} />
            <span className="font-label-sm text-label-sm">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
