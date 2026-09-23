import type { ChildSummary } from "@kidcom/shared";

import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";

export type ChildSelection = string | "both";

// Aura's calendar mockups (docs/Themes/Aura/kidcom_calendar_1..3) don't carry
// a per-page "Showing Schedule For" card the way the pre-Aura theme's did —
// the compact overlapping-avatar pattern below matches the visual language
// of the global header's own child cluster (HeaderChildCluster.tsx) instead.
// This one stays a real, separate control (not merged into the header)
// because it drives actual calendar filtering — a single-child view vs.
// "Both" — which the header's cluster doesn't do (that one navigates to
// child management, see Header.tsx).
export function ChildSelector({
  children,
  selected,
  onSelect,
}: {
  children: ChildSummary[];
  selected: ChildSelection;
  onSelect: (selection: ChildSelection) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-0.5" role="group" aria-label="Child selector">
      {children.map((child) => {
        const isSelected = selected === child.id;
        return (
          <button
            key={child.id}
            onClick={() => onSelect(child.id)}
            className={`flex items-center gap-1.5 pl-1 pr-3 h-9 rounded-full shrink-0 border transition-colors ${
              isSelected
                ? "bg-primary-container border-transparent"
                : "bg-surface-container-lowest border-outline-variant/30"
            }`}
          >
            <span className={`relative inline-block h-7 w-7 rounded-full overflow-hidden ring-2 ${isSelected ? "ring-on-primary-container" : "ring-transparent"}`}>
              <Avatar name={child.firstName} avatarAssetId={child.profileImageUrl} kind="child" size="full" />
            </span>
            <span
              className={`font-label-sm text-label-sm ${isSelected ? "font-bold text-on-primary-container" : "font-medium text-on-surface-variant"}`}
            >
              {child.firstName}
            </span>
          </button>
        );
      })}
      {children.length > 1 && (
        <button
          onClick={() => onSelect("both")}
          className={`flex items-center gap-1.5 pl-1 pr-3 h-9 rounded-full shrink-0 border transition-colors ${
            selected === "both"
              ? "bg-primary-container border-transparent"
              : "bg-surface-container-lowest border-outline-variant/30"
          }`}
        >
          <span
            className={`h-7 w-7 rounded-full flex items-center justify-center ${
              selected === "both" ? "bg-on-primary-container/15 text-on-primary-container" : "bg-surface-container text-on-surface-variant"
            }`}
          >
            <Icon name="group" className="text-[16px]" />
          </span>
          <span
            className={`font-label-sm text-label-sm ${selected === "both" ? "font-bold text-on-primary-container" : "font-medium text-on-surface-variant"}`}
          >
            Both
          </span>
        </button>
      )}
    </div>
  );
}
