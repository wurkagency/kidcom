import type { ChildSummary } from "@kidcom/shared";

import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";

export type ChildSelection = string | "both";

// Matches the "Showing Schedule For:" card at the top of all three mockups
// (docs/stitch_splitkid/calendar_{month,week,list}_view) — a labeled card
// with an avatar row (child photos + a "Both" group icon), the selected
// one ringed in primary with a small check badge. Rendered even for a
// single-child family (the label still applies), unlike the old version
// which hid entirely below 2 children.
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
    <div className="flex flex-col gap-2 bg-surface-container-lowest p-3.5 rounded-2xl border border-outline-variant/30 shadow-sm">
      <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Showing Schedule For:</span>
      <div className="flex items-center gap-5 overflow-x-auto pb-0.5">
        {children.map((child) => {
          const isSelected = selected === child.id;
          return (
            <button key={child.id} onClick={() => onSelect(child.id)} className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className={`relative w-12 h-12 rounded-full p-0.5 border-2 bg-surface shadow-sm ${
                  isSelected ? "border-primary" : "border-transparent"
                }`}
              >
                <Avatar
                  name={child.firstName}
                  avatarAssetId={child.profileImageUrl}
                  kind="child"
                  size="full"
                />
                {isSelected && (
                  <Icon
                    name="check"
                    className="absolute -bottom-0.5 -right-0.5 bg-primary text-on-primary rounded-full text-[12px] p-0.5 border-2 border-surface"
                  />
                )}
              </div>
              <span
                className={`font-label-sm text-label-sm ${isSelected ? "font-bold text-primary" : "font-medium text-on-surface-variant"}`}
              >
                {child.firstName}
              </span>
            </button>
          );
        })}
        {children.length > 1 && (
          <button onClick={() => onSelect("both")} className="flex flex-col items-center gap-1.5 shrink-0">
            <div
              className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-on-surface-variant shadow-sm ${
                selected === "both" ? "border-primary bg-surface" : "border-transparent bg-surface-container-low"
              }`}
            >
              <Icon name="group" className="text-[24px]" />
            </div>
            <span
              className={`font-label-sm text-label-sm ${selected === "both" ? "font-bold text-primary" : "font-medium text-on-surface-variant"}`}
            >
              Both
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
