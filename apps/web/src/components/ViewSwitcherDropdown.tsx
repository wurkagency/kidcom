import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Icon } from "./Icon";

export type ViewSwitcherOption<T extends string> = { value: T; label: string };

// The "Switch View" dropdown from docs/Themes/Aura/kidcom_calendar_1/code.html
// (`#calendar-view-dropdown`) — a single compact trigger + radio-item menu,
// replacing the segmented-tab pattern (ViewTabs.tsx, and the Necessities/
// Wishlist and Journal/Media Gallery tab pairs) everywhere Aura's mockups
// show it. Generic over the view's value type so Calendar, Lists, and
// Journal can each reuse it with their own option set.
export function ViewSwitcherDropdown<T extends string>({
  options,
  value,
  onChange,
  defaultValue,
  triggerIcon = "tune",
}: {
  options: ViewSwitcherOption<T>[];
  value: T;
  onChange: (value: T) => void;
  defaultValue?: T;
  triggerIcon?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-surface-container text-on-surface border border-outline-variant/30 font-label-sm text-label-sm font-semibold shadow-sm transition-all active:scale-95 bg-surface-container-lowest outline-none"
        >
          <Icon name={triggerIcon} className="text-[16px] text-secondary" />
          <span>{current?.label ?? value}</span>
          <Icon name="expand_more" className="text-[16px] text-secondary" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="w-48 rounded-2xl bg-surface-container-lowest p-1.5 shadow-[0_12px_32px_-6px_rgba(22,26,24,0.22)] border border-outline-variant/30 z-50 flex flex-col gap-0.5"
        >
          <div className="px-2.5 py-1.5 font-micro-meta text-micro-meta uppercase tracking-wider text-secondary font-semibold">
            Switch View
          </div>
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <DropdownMenu.Item
                key={opt.value}
                onSelect={() => onChange(opt.value)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left font-label-sm text-label-sm outline-none cursor-pointer transition-colors ${
                  active ? "bg-surface-container-low text-on-surface font-semibold" : "text-on-surface font-medium hover:bg-surface-container-low"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon
                    name={active ? "radio_button_checked" : "radio_button_unchecked"}
                    className={`text-[16px] ${active ? "text-primary" : "text-secondary"}`}
                  />
                  {opt.label}
                </span>
                {defaultValue === opt.value && (
                  <span className="font-micro-meta text-micro-meta text-secondary uppercase font-semibold">
                    Default
                  </span>
                )}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
