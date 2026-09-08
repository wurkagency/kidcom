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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface rounded-t-2xl p-container-padding flex flex-col gap-2 pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-headline-md text-headline-md text-on-surface">Assign "{item.title}"</h3>
          <button type="button" onClick={onClose}>
            <Icon name="close" />
          </button>
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
      </div>
    </div>
  );
}
