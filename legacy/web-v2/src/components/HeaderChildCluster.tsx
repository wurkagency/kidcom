import { Link } from "react-router-dom";
import type { ChildSummary } from "@kidcom/shared";

import { Avatar } from "./Avatar";

// The stacked child-avatar + "All" pill from docs/Themes/Aura/kidcom_children
// and kidcom_today_screen_updated_note's header — replaces the tab-root
// header's old single self-avatar-only right side. Links to /kids, the
// bottom nav's former "Kids" tab (see BottomNav.tsx), so child management
// stays one tap away everywhere that tab used to be.
export function HeaderChildCluster({ children }: { children: ChildSummary[] }) {
  if (children.length === 0) return null;
  const shown = children.slice(0, 2);
  return (
    <Link
      to="/kids"
      aria-label="Children"
      className="flex items-center -space-x-2 p-0.5 rounded-full bg-surface-container/50 border border-outline-variant/30"
    >
      {shown.map((child) => (
        <span key={child.id} className="relative inline-block h-8 w-8 rounded-full ring-2 ring-surface overflow-hidden">
          <Avatar name={child.firstName} avatarAssetId={child.profileImageUrl} kind="child" size="full" />
        </span>
      ))}
      <span className="relative inline-flex items-center justify-center h-8 min-w-8 px-2 rounded-full ring-2 ring-surface bg-surface-container-high text-on-surface">
        <span className="font-label-sm text-label-sm">All</span>
      </span>
    </Link>
  );
}
