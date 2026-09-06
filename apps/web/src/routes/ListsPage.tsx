import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import type { ChildDetail, ListItemDto, ListItemType, CreateListItemRequest } from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { apiFetch, apiGet, apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useHeaderConfig } from "../lib/HeaderContext";

// No Stitch mockup exists for this screen (see chunk 6 plan notes) — built
// from the PRD text using the existing Kindred Path tokens. Necessities and
// wishlist share one model (ListItem.type), split into two sections here.
export function ListsPage() {
  const { childId } = useParams<{ childId: string }>();
  const { user } = useAuth();

  const [child, setChild] = useState<ChildDetail | null>(null);
  const [items, setItems] = useState<ListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingType, setAddingType] = useState<ListItemType | null>(null);
  const [title, setTitle] = useState("");
  const [sizeValue, setSizeValue] = useState("");
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  useHeaderConfig({ title: `${child?.firstName ?? ""}'s Shared List` }, [child]);

  async function load() {
    if (!childId) return;
    setLoading(true);
    setError(null);
    try {
      const [childRes, itemsRes] = await Promise.all([
        apiGet<ChildDetail>(`/children/${childId}`),
        apiGet<{ items: ListItemDto[] }>(`/children/${childId}/lists`),
      ]);
      setChild(childRes);
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

  function openAdd(type: ListItemType) {
    setAddingType(type);
    setTitle("");
    setSizeValue("");
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!childId || !addingType || !title.trim()) return;
    try {
      const created = await apiPost<ListItemDto>(`/children/${childId}/lists`, {
        type: addingType,
        title: title.trim(),
        sizeValue: sizeValue.trim() || undefined,
      } satisfies CreateListItemRequest);
      setItems((prev) => [...prev, created]);
      setAddingType(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't add that item");
    }
  }

  async function handleClaimToggle(item: ListItemDto) {
    if (!childId) return;
    setBusyItemId(item.id);
    setError(null);
    try {
      const updated = await apiFetch<ListItemDto>(`/children/${childId}/lists/${item.id}/claim`, {
        method: "PATCH",
      });
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
      await apiFetch(`/children/${childId}/lists/${item.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't remove that item");
    } finally {
      setBusyItemId(null);
    }
  }

  function Section({ type, label, icon }: { type: ListItemType; label: string; icon: string }) {
    const sectionItems = items.filter((it) => it.type === type);
    return (
      <div className="flex flex-col gap-element-gap">
        <div className="flex items-center justify-between">
          <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
            <Icon name={icon} className="text-[16px]" /> {label}
          </h3>
          <button
            onClick={() => openAdd(type)}
            className="font-label-sm text-label-sm text-primary flex items-center gap-1"
          >
            <Icon name="add" className="text-[16px]" /> Add
          </button>
        </div>

        {sectionItems.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">Nothing here yet.</p>
        )}

        <div className="flex flex-col gap-2">
          {sectionItems.map((item) => {
            const claimedByMe = item.claimedById === user?.id;
            return (
              <div
                key={item.id}
                className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex items-center justify-between gap-3"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-label-md text-label-md text-on-surface truncate">{item.title}</span>
                  {item.sizeValue && (
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      Size: {item.sizeValue}
                    </span>
                  )}
                  {item.claimedByName && (
                    <span
                      className={`font-label-sm text-label-sm ${claimedByMe ? "text-primary" : "text-on-surface-variant"}`}
                    >
                      Claimed by {claimedByMe ? "you" : item.claimedByName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!item.claimedById || claimedByMe ? (
                    <button
                      onClick={() => handleClaimToggle(item)}
                      disabled={busyItemId === item.id}
                      className={`font-label-sm text-label-sm py-2 px-4 rounded-full disabled:opacity-60 ${
                        claimedByMe ? "bg-surface-container text-on-surface-variant" : "bg-primary text-on-primary"
                      }`}
                    >
                      {claimedByMe ? "Unclaim" : "Claim"}
                    </button>
                  ) : (
                    <span className="font-label-sm text-label-sm text-on-surface-variant px-2">Claimed</span>
                  )}
                  <button
                    onClick={() => handleDelete(item)}
                    disabled={busyItemId === item.id}
                    className="w-9 h-9 flex items-center justify-center text-on-surface-variant disabled:opacity-60"
                  >
                    <Icon name="delete" className="text-[18px]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
      </section>
    );
  }

  if (!child) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-error">{error ?? "Child not found"}</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col w-full pb-8">
      <div className="px-container-padding pt-4 flex flex-col gap-section-margin">
        <p className="font-body-md text-body-md text-on-surface-variant">
          {child.firstName}
          {(child.clothingSize || child.shoeSize) && (
            <>
              {" "}
              • Clothing {child.clothingSize ?? "—"} · Shoe {child.shoeSize ?? "—"}
            </>
          )}
        </p>
        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
        )}
        <Section type="NECESSITY" label="Necessities" icon="checkroom" />
        <Section type="WISHLIST" label="Wishlist" icon="redeem" />
      </div>

      {addingType && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <form
            onSubmit={handleAdd}
            className="w-full max-w-md bg-surface rounded-t-2xl p-container-padding flex flex-col gap-4 pb-safe"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-headline-md text-on-surface">
                Add to {addingType === "NECESSITY" ? "Necessities" : "Wishlist"}
              </h3>
              <button type="button" onClick={() => setAddingType(null)}>
                <Icon name="close" />
              </button>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Item, e.g. Winter coat"
              className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
              required
              autoFocus
            />
            <input
              value={sizeValue}
              onChange={(e) => setSizeValue(e.target.value)}
              placeholder={
                child.clothingSize || child.shoeSize
                  ? `Size (e.g. ${child.clothingSize ?? child.shoeSize})`
                  : "Size (optional)"
              }
              className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
            />
            <button
              type="submit"
              disabled={!title.trim()}
              className="w-full py-4 bg-primary text-on-primary rounded-full font-label-md text-label-md disabled:opacity-60"
            >
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
