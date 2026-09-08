import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ChildDetail, ChildFamilyMember, ListItemDto, ListItemType } from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { apiDelete, apiGet, apiPatch, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

type Member = { userId: string; firstName: string; lastName: string; avatarUrl: string | null };

// Matches docs/stitch_splitkid/shared_lists/code.html: a two-tab
// Necessities/Wishlist screen with a sliding pill switcher and a single FAB.
// Necessities support real assignment (any family member can assign/reassign
// an item to any other family member — ListItem.assignedToId). Wishlist keeps
// the existing self-claim mechanic, relabeled "Reserve" per the mockup.
export function ListsPage() {
  const { children, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedChildId = searchParams.get("child");
  const [selectedId, setSelectedId] = useState<string | undefined>(
    requestedChildId ?? children[0]?.id
  );
  const childId = selectedId ?? children[0]?.id;

  const [child, setChild] = useState<ChildDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [items, setItems] = useState<ListItemDto[]>([]);
  const [tab, setTab] = useState<ListItemType>("NECESSITY");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigningItem, setAssigningItem] = useState<ListItemDto | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  async function load() {
    if (!childId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [childRes, familyRes, itemsRes] = await Promise.all([
        apiGet<ChildDetail>(`/children/${childId}`),
        apiGet<{ members: ChildFamilyMember[] }>(`/children/${childId}/family`),
        apiGet<{ items: ListItemDto[] }>(`/children/${childId}/lists`),
      ]);
      setChild(childRes);
      setMembers(familyRes.members);
      setItems(itemsRes.items);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load the list");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function handleAssign(item: ListItemDto, assignedToId: string | null) {
    if (!childId) return;
    setBusyItemId(item.id);
    setError(null);
    try {
      const updated = await apiPatch<ListItemDto>(`/children/${childId}/lists/${item.id}/assign`, {
        assignedToId,
      });
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      setAssigningItem(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't update that assignment");
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleClaimToggle(item: ListItemDto) {
    if (!childId) return;
    setBusyItemId(item.id);
    setError(null);
    try {
      const updated = await apiPatch<ListItemDto>(`/children/${childId}/lists/${item.id}/claim`, {});
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't update that item");
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleDelete(item: ListItemDto) {
    if (!childId) return;
    setBusyItemId(item.id);
    try {
      await apiDelete(`/children/${childId}/lists/${item.id}`);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't remove that item");
    } finally {
      setBusyItemId(null);
    }
  }

  if (children.length === 0) {
    return (
      <section className="px-container-padding pt-6 flex flex-col gap-2">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Lists</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Add a child first to start a shared list.
        </p>
      </section>
    );
  }

  if (loading || !child) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
      </section>
    );
  }

  const tabItems = items.filter((it) => it.type === tab);

  return (
    <div className="flex flex-col w-full px-container-padding gap-section-margin pt-4 pb-32 relative">
      {children.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`px-4 py-2 rounded-full font-label-md text-label-md whitespace-nowrap ${
                c.id === childId ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"
              }`}
            >
              {c.firstName}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="flex flex-col gap-element-gap">
        <div className="flex p-1 bg-surface-container-high rounded-full w-full">
          <button
            onClick={() => setTab("NECESSITY")}
            className={`flex-1 py-2 text-center rounded-full font-label-md text-label-md transition-colors ${
              tab === "NECESSITY" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant"
            }`}
          >
            Necessities
          </button>
          <button
            onClick={() => setTab("WISHLIST")}
            className={`flex-1 py-2 text-center rounded-full font-label-md text-label-md transition-colors ${
              tab === "WISHLIST" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant"
            }`}
          >
            Wishlist
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-element-gap">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-headline-md text-on-surface">
            {tab === "NECESSITY" ? "Essential Needs" : "Gift Ideas"}
          </h2>
          <span className="bg-primary-container/20 text-on-primary-container px-3 py-1 rounded-full font-label-sm">
            {tabItems.length} item{tabItems.length === 1 ? "" : "s"}
          </span>
        </div>

        {tabItems.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">Nothing here yet.</p>
        )}

        {tab === "NECESSITY"
          ? tabItems.map((item) => (
              <NecessityCard
                key={item.id}
                item={item}
                busy={busyItemId === item.id}
                onOpenAssign={() => setAssigningItem(item)}
                onDelete={() => handleDelete(item)}
              />
            ))
          : tabItems.map((item) => (
              <WishlistCard
                key={item.id}
                item={item}
                currentUserId={user?.id}
                busy={busyItemId === item.id}
                onReserveToggle={() => handleClaimToggle(item)}
                onDelete={() => handleDelete(item)}
              />
            ))}
      </div>

      {childId && (
        <button
          onClick={() => navigate(`/children/${childId}/lists/new?type=${tab}`)}
          className="fixed bottom-24 right-container-padding w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:bg-surface-tint active:scale-95 transition-transform z-40"
        >
          <Icon name="add" className="text-[28px]" />
        </button>
      )}

      {assigningItem && (
        <AssignSheet
          item={assigningItem}
          members={members}
          busy={busyItemId === assigningItem.id}
          onClose={() => setAssigningItem(null)}
          onPick={(assignedToId) => handleAssign(assigningItem, assignedToId)}
        />
      )}
    </div>
  );
}

function NecessityCard({
  item,
  busy,
  onOpenAssign,
  onDelete,
}: {
  item: ListItemDto;
  busy: boolean;
  onOpenAssign: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-[0_2px_8px_rgba(50,105,67,0.05)] flex items-start gap-4">
      <div className="w-16 h-16 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
        <Icon name="checkroom" className="text-on-surface-variant text-3xl" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-label-md text-on-surface line-clamp-2">{item.title}</h3>
          <div className="flex items-center gap-2 shrink-0">
            {item.sizeValue && (
              <span className="bg-tertiary-container/20 text-on-tertiary-container px-2 py-0.5 rounded-md font-label-sm whitespace-nowrap">
                Size: {item.sizeValue}
              </span>
            )}
            <button
              onClick={onDelete}
              disabled={busy}
              className="w-6 h-6 flex items-center justify-center text-on-surface-variant disabled:opacity-60"
            >
              <Icon name="delete" className="text-[16px]" />
            </button>
          </div>
        </div>
        {item.description && (
          <p className="font-body-md text-sm text-on-surface-variant mb-3 line-clamp-3">{item.description}</p>
        )}
        <button onClick={onOpenAssign} disabled={busy} className="flex items-center gap-2 disabled:opacity-60">
          {item.assignedToId ? (
            <>
              <Avatar name={item.assignedToName ?? "?"} avatarAssetId={null} kind="adult" size="sm" />
              <span className="font-label-sm text-primary">Handled by {item.assignedToName}</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-alert-soft-red" />
              <span className="font-label-sm text-on-surface-variant">Still Needed</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function WishlistCard({
  item,
  currentUserId,
  busy,
  onReserveToggle,
  onDelete,
}: {
  item: ListItemDto;
  currentUserId: string | undefined;
  busy: boolean;
  onReserveToggle: () => void;
  onDelete: () => void;
}) {
  const reservedByMe = item.claimedById === currentUserId;
  const reservedByOther = !!item.claimedById && !reservedByMe;

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-4 shadow-[0_2px_8px_rgba(50,105,67,0.05)] flex flex-col gap-3 ${
        reservedByOther ? "opacity-75" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="w-20 h-20 rounded-lg bg-surface-container shrink-0 flex items-center justify-center">
          <Icon name="redeem" className="text-on-surface-variant text-3xl" />
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-label-md text-on-surface line-clamp-2 mb-1">{item.title}</h3>
            <button
              onClick={onDelete}
              disabled={busy}
              className="w-6 h-6 flex items-center justify-center text-on-surface-variant disabled:opacity-60 shrink-0"
            >
              <Icon name="delete" className="text-[16px]" />
            </button>
          </div>
          {item.description && (
            <p className="font-body-md text-sm text-on-surface-variant mb-2">{item.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-1 border-t border-surface-container pt-3">
        {reservedByOther ? (
          <>
            <div className="flex items-center gap-2">
              <Icon name="check_circle" className="text-primary text-sm" />
              <span className="font-label-sm text-primary">Reserved by {item.claimedByName}</span>
            </div>
            <button
              disabled
              className="px-4 py-2 bg-surface-container-low text-on-surface-variant font-label-sm rounded-full cursor-not-allowed"
            >
              Reserved
            </button>
          </>
        ) : (
          <div className="flex justify-end w-full">
            <button
              onClick={onReserveToggle}
              disabled={busy}
              className="px-4 py-2 bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-sm rounded-full transition-colors disabled:opacity-60"
            >
              {reservedByMe ? "Un-reserve" : "Reserve Item"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AssignSheet({
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
