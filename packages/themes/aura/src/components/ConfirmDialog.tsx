import type { ReactNode } from "react";
import { useT } from "@kinnd/core";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";

/** A destructive-action confirmation: DESIGN.md white squircle, obsidian and surface pills. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const { t } = useT("common");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="rounded-[28px] border-hairline bg-surface-container-lowest p-space-lg shadow-[0_12px_32px_-6px_rgba(22,26,24,0.22)] gap-space-md"
      >
        <DialogTitle className="font-headline-sm text-headline-sm text-on-surface">{title}</DialogTitle>
        {body && <DialogDescription className="font-body-md text-body-md text-secondary">{body}</DialogDescription>}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 py-3 px-4 rounded-full bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-all"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="flex-1 py-3 px-4 rounded-full bg-error text-on-error font-label-md text-label-md hover:opacity-90 transition-all disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
