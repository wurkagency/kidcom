import { Link, paths, useT } from "@kidcom/core";

import { Icon } from "../components/Icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";

// The dock's "+" action sheet. No Stitch export shows it, so it is composed
// strictly from DESIGN.md parts: mint action pills with 48px white icon
// discs, a white bottom sheet with a 32px squircle top edge.

const ACTIONS = [
  { key: "moment", icon: "photo_camera", to: paths.moments.create() },
  { key: "event", icon: "event", to: paths.events.create() },
  { key: "listItem", icon: "checklist", to: paths.lists.create() },
  { key: "message", icon: "chat_bubble", to: paths.messages.compose() },
] as const;

export function QuickActionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT("shell");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="pointer-events-auto rounded-t-[32px] border-hairline bg-surface-container-lowest px-margin pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-space-lg"
      >
        <SheetHeader className="p-0 pb-space-md text-left">
          <SheetTitle className="font-headline-sm text-headline-sm text-on-surface">{t("quickActions.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("quickActions.description")}</SheetDescription>
        </SheetHeader>
        <ul className="grid grid-cols-2 gap-gutter">
          {ACTIONS.map((action) => (
            <li key={action.key}>
              <Link
                to={action.to}
                onClick={() => onOpenChange(false)}
                className="flex flex-col items-start gap-space-sm rounded-[28px] border border-hairline bg-mint p-gutter transition-transform active:scale-[0.98]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-lowest text-on-surface">
                  <Icon name={action.icon} className="text-[20px]" />
                </span>
                <span className="font-title-md text-title-md text-on-surface">{t(`quickActions.${action.key}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
