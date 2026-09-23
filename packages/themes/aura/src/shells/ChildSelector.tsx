import { useState } from "react";
import type { ChildSummary } from "@kidcom/shared";
import { useActiveChildren, useT } from "@kidcom/core";

import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

// Header child selector (000_base_scaffold). Display rule (signed off):
//   1 child  → 1 avatar
//   2        → 2 avatars
//   3+       → 2 avatars + an "All" avatar that opens the full list
// The selected child carries the obsidian ring (ring-primary); with "all"
// selected, every visible avatar does (1–2 children) or the All avatar does
// (3+). Tapping the selected child again returns to all children.

const avatarButton =
  "relative inline-block h-8 w-8 rounded-full ring-2 overflow-hidden shadow-sm hover:z-20 transition-transform active:scale-95";

function ChildAvatar({ child }: { child: ChildSummary }) {
  return <PersonAvatar mediaId={child.profileImageUrl} initials={child.firstName.charAt(0)} className="size-full" />;
}

export function ChildSelector() {
  const { t } = useT("shell");
  const { children, filter, selectAll, selectChild, isSelected } = useActiveChildren();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (children.length === 0) return null;

  const allSelected = filter.kind === "all";
  // A tap shows just that child; tapping the only selected child again goes back to all.
  const toggle = (id: string) =>
    isSelected(id) && filter.kind === "some" && filter.childIds.length === 1 ? selectAll() : selectChild(id);

  // With 3+ children, keep a selected child visible among the two avatars.
  let visible = children.slice(0, 2);
  const firstSelected = filter.kind === "some" ? children.find((c) => c.id === filter.childIds[0]) : undefined;
  if (children.length > 2 && firstSelected && !visible.some((c) => c.id === firstSelected.id)) {
    visible = [firstSelected, children[0]!];
  }
  const showAll = children.length > 2;

  return (
    <div
      className="flex -space-x-2 overflow-hidden items-center p-1 rounded-full bg-surface-container/50 border border-outline-variant/30"
      role="group"
      aria-label={t("childSelector.label")}
    >
      {visible.map((child) => {
        const active = isSelected(child.id) || (allSelected && !showAll);
        return (
          <button
            key={child.id}
            type="button"
            aria-label={t("childSelector.select", { name: child.firstName })}
            aria-pressed={isSelected(child.id)}
            onClick={() => toggle(child.id)}
            className={cn(avatarButton, active ? "ring-primary z-10" : "ring-surface")}
          >
            <ChildAvatar child={child} />
          </button>
        );
      })}
      {showAll && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("childSelector.selectAll")}
              className={cn(
                "relative inline-flex items-center justify-center h-8 w-8 rounded-full ring-2 bg-surface-container-high text-[11px] font-bold text-on-surface hover:z-20 transition-transform active:scale-95",
                allSelected ? "ring-primary z-10" : "ring-surface",
              )}
            >
              <span className="font-label-sm text-label-sm">{t("childSelector.all")}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 rounded-[24px] border-hairline p-2 shadow-float">
            <ul className="flex flex-col gap-1">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    selectAll();
                    setPickerOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-space-sm rounded-full px-space-sm py-2 text-left font-label-md text-label-md text-on-surface hover:bg-surface-container-low",
                    allSelected && "bg-secondary-container",
                  )}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high font-label-sm text-label-sm">
                    {t("childSelector.all")}
                  </span>
                  {t("childSelector.allChildren")}
                </button>
              </li>
              {children.map((child) => (
                <li key={child.id}>
                  <button
                    type="button"
                    onClick={() => {
                      selectChild(child.id);
                      setPickerOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-space-sm rounded-full px-space-sm py-2 text-left font-label-md text-label-md text-on-surface hover:bg-surface-container-low",
                      isSelected(child.id) && "bg-secondary-container",
                    )}
                  >
                    <span className="inline-block h-8 w-8 overflow-hidden rounded-full">
                      <ChildAvatar child={child} />
                    </span>
                    {child.firstName}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
