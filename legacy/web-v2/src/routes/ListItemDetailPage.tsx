import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { CalendarEventDto, ChildFamilyMember, ListItemDto, MediaUploadResponse } from "@kidcom/shared";

import { AssignSheet, type Member } from "../components/AssignSheet";
import { Icon } from "../components/Icon";
import { ListItemImage } from "../components/ListItemImage";
import { apiDelete, apiGet, apiPatch, apiUpload, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useHeaderConfig } from "../lib/HeaderContext";

// Mirrors JournalPostPage.tsx's fetch-by-id pattern: the route param is the
// source of truth (works on a direct link/reload), router state is only an
// optimistic first paint carried over from ListsPage's card click.
export function ListItemDetailPage() {
  const { childId, itemId } = useParams<{ childId: string; itemId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stateItem = (location.state as { item?: ListItemDto } | null)?.item ?? null;
  const [item, setItem] = useState<ListItemDto | null>(stateItem);
  const [members, setMembers] = useState<Member[]>([]);
  const [linkedEvent, setLinkedEvent] = useState<CalendarEventDto | null>(null);
  const [loading, setLoading] = useState(!stateItem);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useHeaderConfig(
    { title: item?.type === "WISHLIST" ? "Wishlist Item" : "Necessity", backTo: "/lists" },
    [item?.type]
  );

  async function load() {
    if (!childId || !itemId) return;
    setLoading(true);
    setError(null);
    try {
      const [itemRes, familyRes] = await Promise.all([
        apiGet<ListItemDto>(`/children/${childId}/lists/${itemId}`),
        apiGet<{ members: ChildFamilyMember[] }>(`/children/${childId}/family`),
      ]);
      setItem(itemRes);
      setMembers(familyRes.members);
      if (itemRes.type === "WISHLIST" && itemRes.calendarEventId) {
        try {
          setLinkedEvent(await apiGet<CalendarEventDto>(`/children/${childId}/calendar-events/${itemRes.calendarEventId}`));
        } catch {
          setLinkedEvent(null);
        }
      } else {
        setLinkedEvent(null);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load this item");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, itemId]);

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !childId || !itemId) return;
    setUploadingImage(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const asset = await apiUpload<MediaUploadResponse>("/media/upload", formData);
      const updated = await apiPatch<ListItemDto>(`/children/${childId}/lists/${itemId}`, {
        imageAssetId: asset.id,
      });
      setItem(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't upload that photo");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleRemoveImage() {
    if (!childId || !itemId) return;
    setUploadingImage(true);
    setError(null);
    try {
      const updated = await apiPatch<ListItemDto>(`/children/${childId}/lists/${itemId}`, {
        imageAssetId: null,
      });
      setItem(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't remove that photo");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleAssign(assignedToId: string | null) {
    if (!childId || !itemId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiPatch<ListItemDto>(`/children/${childId}/lists/${itemId}/assign`, { assignedToId });
      setItem(updated);
      setAssigning(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't update that assignment");
    } finally {
      setBusy(false);
    }
  }

  async function handleReserveToggle() {
    if (!childId || !itemId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiPatch<ListItemDto>(`/children/${childId}/lists/${itemId}/claim`, {});
      setItem(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't update that item");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!childId || !itemId || !item) return;
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/children/${childId}/lists/${itemId}`);
      navigate(`/lists?child=${childId}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't remove that item");
      setBusy(false);
    }
  }

  if (loading && !item) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
      </section>
    );
  }

  if (!item || !childId || !itemId) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
          {error ?? "Couldn't find this item"}
        </p>
      </section>
    );
  }

  const reservedByMe = item.claimedById === user?.id;
  const reservedByOther = !!item.claimedById && !reservedByMe;

  return (
    <div className="flex flex-col w-full px-container-padding gap-section-margin pt-4 pb-32">
      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="relative">
        <ListItemImage
          imageAssetId={item.imageAssetId}
          alt={item.title}
          className="w-full aspect-square rounded-2xl"
          fallback={
            <div className="w-full aspect-square rounded-2xl bg-surface-container flex items-center justify-center">
              <Icon
                name={item.type === "WISHLIST" ? "redeem" : "checkroom"}
                className="text-on-surface-variant text-5xl"
              />
            </div>
          }
        />
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
        <div className="absolute bottom-3 right-3 flex gap-2">
          {item.imageAssetId && (
            <button
              type="button"
              onClick={handleRemoveImage}
              disabled={uploadingImage}
              className="py-2 px-4 rounded-full bg-surface-container-lowest/90 text-error font-label-sm text-label-sm shadow-sm disabled:opacity-60"
            >
              Remove photo
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            className="py-2 px-4 rounded-full bg-primary text-on-primary font-label-sm text-label-sm shadow-sm disabled:opacity-60"
          >
            {uploadingImage ? "Uploading…" : item.imageAssetId ? "Replace photo" : "Add photo"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{item.title}</h1>
          {item.sizeValue && (
            <span className="bg-tertiary-container/20 text-on-tertiary-container px-2 py-0.5 rounded-md font-label-sm whitespace-nowrap shrink-0">
              Size: {item.sizeValue}
            </span>
          )}
        </div>
        {item.description && (
          <p className="font-body-md text-body-md text-on-surface-variant">{item.description}</p>
        )}
      </div>

      {item.type === "NECESSITY" ? (
        <button
          onClick={() => setAssigning(true)}
          disabled={busy}
          className="flex items-center gap-2 disabled:opacity-60 bg-surface-container-lowest rounded-xl p-4 shadow-sm"
        >
          {item.assignedToId ? (
            <span className="font-label-md text-primary">Handled by {item.assignedToName}</span>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-alert-soft-red" />
              <span className="font-label-md text-on-surface-variant">Still Needed — tap to assign</span>
            </>
          )}
        </button>
      ) : (
        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex items-center justify-between">
          {reservedByOther ? (
            <>
              <div className="flex items-center gap-2">
                <Icon name="check_circle" className="text-primary text-sm" />
                <span className="font-label-md text-primary">Reserved by {item.claimedByName}</span>
              </div>
              <button
                disabled
                className="px-4 py-2 bg-surface-container-low text-on-surface-variant font-label-sm rounded-full cursor-not-allowed"
              >
                Reserved
              </button>
            </>
          ) : (
            <>
              <span className="font-label-md text-on-surface-variant">
                {reservedByMe ? "You're getting this" : "Not reserved yet"}
              </span>
              <button
                onClick={handleReserveToggle}
                disabled={busy}
                className="px-4 py-2 bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-sm rounded-full transition-colors disabled:opacity-60"
              >
                {reservedByMe ? "Un-reserve" : "Reserve Item"}
              </button>
            </>
          )}
        </div>
      )}

      {item.type === "WISHLIST" && linkedEvent && (
        <button
          onClick={() => navigate("/calendar")}
          className="flex items-center gap-3 bg-surface-container-lowest rounded-xl p-4 shadow-sm text-left"
        >
          <Icon name="event" className="text-primary" />
          <div className="flex-1 min-w-0">
            <p className="font-label-md text-on-surface truncate">{linkedEvent.title}</p>
            <p className="font-label-sm text-on-surface-variant">
              {new Date(linkedEvent.startsAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <Icon name="chevron_right" className="text-on-surface-variant" />
        </button>
      )}

      <div className="flex gap-3 mt-2">
        <button
          onClick={() => navigate(`/children/${childId}/lists/${itemId}/edit`)}
          className="flex-1 py-3 rounded-full bg-surface-container text-primary font-label-md text-label-md"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          disabled={busy}
          className="flex-1 py-3 rounded-full bg-alert-soft-red/20 text-error font-label-md text-label-md disabled:opacity-60"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>

      {assigning && (
        <AssignSheet
          item={item}
          members={members}
          busy={busy}
          onClose={() => setAssigning(false)}
          onPick={handleAssign}
        />
      )}
    </div>
  );
}
