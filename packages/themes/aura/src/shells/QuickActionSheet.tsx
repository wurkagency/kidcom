import { Link, paths, useT } from "@kinnd/core";

import { Icon } from "../components/Icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";

// The dock's "+" — a multi-purpose create sidebar sliding in from the right.
// No Stitch export shows it, so it is composed strictly from DESIGN.md parts:
// a white surface with a 32px squircle leading edge, rows of 48px mint icon
// discs with title-md labels, hairline separators.

const ACTIONS = [
  { key: "appointment", icon: "event", to: paths.events.create() },
  { key: "message", icon: "chat_bubble", to: paths.messages.compose() },
  { key: "note", icon: "sticky_note_2", to: paths.notes.create() },
  { key: "task", icon: "task_alt", to: paths.tasks.create() },
  { key: "moment", icon: "photo_camera", to: paths.moments.create() },
  { key: "listItem", icon: "checklist", to: paths.lists.create() },
  { key: "swap", icon: "swap_horiz", to: paths.swapRequest() },
] as const;

export function QuickActionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT("shell");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="pointer-events-auto w-[85%] max-w-sm gap-0 rounded-l-[32px] border-hairline bg-surface-container-lowest px-margin pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
      >
        <SheetHeader className="p-0 pb-space-lg text-left">
          <SheetTitle className="font-headline-md text-headline-md text-on-surface">{t("quickActions.title")}</SheetTitle>
          <SheetDescription className="font-body-md text-body-md text-on-surface-variant">
            {t("quickActions.description")}
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col divide-y divide-hairline">
          {ACTIONS.map((action) => (
            <li key={action.key}>
              <Link
                to={action.to}
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-space-md py-space-sm transition-opacity active:opacity-70"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mint text-on-surface">
                  <Icon name={action.icon} className="text-[20px]" />
                </span>
                <span className="flex-1 font-title-md text-title-md text-on-surface">{t(`quickActions.${action.key}`)}</span>
                <Icon name="chevron_right" className="text-[20px] text-on-surface-variant" />
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
