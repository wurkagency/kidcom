import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "react-router-dom";

import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { useAuth } from "../lib/AuthContext";

// The floating "+" from docs/Themes/Aura/kidcom_children/code.html's bottom
// dock, added globally (all skins, not just Aura) alongside BottomNav — see
// AppShell.tsx for how the two are laid out together. Styled with the same
// secondary-container/on-secondary-container tokens every skin already
// themes (no new --color-fab-* tokens needed), so it reads as a soft accent
// chip on Greenkeeper/Sky/Architecture and Aura's sage mint on Aura.
//
// Opens a small sheet offering the three "create" flows that used to only
// be reachable from inside each tab (Journal's own FAB, a child's Calendar
// tab, a child's Lists tab). Adding an event or list item needs a child:
// with exactly one, it jumps straight there; with more than one, an inline
// picker step asks which child first; with none yet, it sends the user to
// Kids to add one instead of dead-ending.
type PendingAction = "event" | "list" | null;

export function QuickAddButton() {
  const navigate = useNavigate();
  const { children } = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);

  function reset() {
    setOpen(false);
    setPending(null);
  }

  function startAction(action: "event" | "list") {
    if (children.length === 0) {
      reset();
      navigate("/kids");
      return;
    }
    if (children.length === 1) {
      reset();
      navigate(
        action === "event"
          ? `/children/${children[0].id}/calendar-events/new`
          : `/children/${children[0].id}/lists/new`
      );
      return;
    }
    setPending(action);
  }

  function pickChild(childId: string) {
    const action = pending;
    reset();
    if (action === "event") navigate(`/children/${childId}/calendar-events/new`);
    else if (action === "list") navigate(`/children/${childId}/lists/new`);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : reset())}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Quick add"
          className="w-14 h-14 shrink-0 rounded-full bg-secondary-container text-on-secondary-container shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          <Icon name="add" className="text-[26px]" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 w-full max-w-md mx-auto bg-surface rounded-t-2xl p-container-padding flex flex-col gap-2 pb-safe outline-none">
          {pending ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <DialogPrimitive.Title asChild>
                  <h3 className="font-headline-md text-headline-md text-on-surface">Which child?</h3>
                </DialogPrimitive.Title>
                <DialogPrimitive.Close asChild>
                  <button type="button" aria-label="Close" onClick={reset}>
                    <Icon name="close" />
                  </button>
                </DialogPrimitive.Close>
              </div>
              {children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => pickChild(child.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container-low text-left"
                >
                  <Avatar name={child.firstName} avatarAssetId={child.profileImageUrl} kind="child" size="sm" />
                  <span className="font-label-md text-label-md text-on-surface">{child.firstName}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <DialogPrimitive.Title asChild>
                  <h3 className="font-headline-md text-headline-md text-on-surface">Add</h3>
                </DialogPrimitive.Title>
                <DialogPrimitive.Close asChild>
                  <button type="button" aria-label="Close">
                    <Icon name="close" />
                  </button>
                </DialogPrimitive.Close>
              </div>
              <button
                onClick={() => {
                  reset();
                  navigate("/journal/new");
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container-low text-left"
              >
                <Icon name="photo_library" className="text-on-surface-variant" />
                <span className="font-label-md text-label-md text-on-surface">Add moment</span>
              </button>
              <button
                onClick={() => startAction("event")}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container-low text-left"
              >
                <Icon name="event" className="text-on-surface-variant" />
                <span className="font-label-md text-label-md text-on-surface">Add event</span>
              </button>
              <button
                onClick={() => startAction("list")}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container-low text-left"
              >
                <Icon name="checklist" className="text-on-surface-variant" />
                <span className="font-label-md text-label-md text-on-surface">Add list item</span>
              </button>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
