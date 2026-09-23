import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import type { ListItemDto } from "@kidcom/shared";

// A family member eligible to be assigned a Necessity — same shape ListsPage
// and ListItemDetailPage both already fetch from GET /children/:childId/family.
export type Member = { userId: string; firstName: string; lastName: string; avatarUrl: string | null };

// Bottom-sheet picker for a Necessity's `assignedToId` — any family member
// may assign/reassign to any other family member (real delegation, not
// self-claim). Extracted out of ListsPage.tsx so ListItemDetailPage can
// reuse it without duplicating this markup — same props/behavior as before.
//
// Built on Radix's Dialog primitive (@radix-ui/react-dialog — the same one
// shadcn/ui's Sheet wraps), composed directly rather than through the
// generated ui/sheet.tsx's SheetContent convenience wrapper: this sheet's
// centered-and-capped-width backdrop (`max-w-md mx-auto`, a lighter
// `bg-black/40` overlay) doesn't match Sheet's own full-bleed/darker
// defaults. Both callers only ever mount this component while it should be
// showing ({assigning && <AssignSheet .../>}), so `open` is always true for
// as long as it's mounted — same pattern as before. Behavior addition:
// Escape and outside-click now also call onClose() through Radix's
// onOpenChange, on top of the existing close button and backdrop click.
export function AssignSheet({
  item,
  members,
  busy,
  onClose,
  onPick,
}: {
  item: ListItemDto;
  members: Member[];
  busy: boolean;
  onClose: () => void;
  onPick: (assignedToId: string | null) => void;
}) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <DialogPrimitive.Content className="w-full max-w-md bg-surface rounded-t-2xl p-container-padding flex flex-col gap-2 pb-safe outline-none">
            <div className="flex items-center justify-between mb-2">
              <DialogPrimitive.Title asChild>
                <h3 className="font-headline-md text-headline-md text-on-surface">Assign "{item.title}"</h3>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <button type="button" aria-label="Close">
                  <Icon name="close" />
                </button>
              </DialogPrimitive.Close>
            </div>
            <button
              onClick={() => onPick(null)}
              disabled={busy}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container-low text-left disabled:opacity-60"
            >
              <span className="w-2 h-2 rounded-full bg-alert-soft-red ml-1" />
              <span className="font-label-md text-label-md text-on-surface">Still Needed (unassign)</span>
            </button>
            {members.map((m) => (
              <button
                key={m.userId}
                onClick={() => onPick(m.userId)}
                disabled={busy}
                className={`w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container-low text-left disabled:opacity-60 ${
                  item.assignedToId === m.userId ? "bg-primary/10" : ""
                }`}
              >
                <Avatar name={`${m.firstName} ${m.lastName}`} avatarAssetId={m.avatarUrl} kind="adult" size="sm" />
                <span className="font-label-md text-label-md text-on-surface">
                  {m.firstName} {m.lastName}
                </span>
              </button>
            ))}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
