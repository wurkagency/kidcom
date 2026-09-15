import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type {
  CalendarEventDto,
  ChildDetail,
  ChildFamilyMember,
  CreateCalendarEventRequest,
  CreateListItemRequest,
  ListItemDto,
  ListItemType,
  MediaUploadResponse,
  UpdateListItemRequest,
} from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { ListItemImage } from "../components/ListItemImage";
import { Toggle } from "../components/Toggle";
import { apiGet, apiPatch, apiPost, apiUpload, ApiRequestError } from "../lib/api";
import { useHeaderConfig } from "../lib/HeaderContext";

type Member = { userId: string; firstName: string; lastName: string; avatarUrl: string | null };

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}
function toTimeInput(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

// Full-page replacement for ListsPage's old AddItemSheet bottom-sheet modal.
// Mirrors JournalComposePage.tsx's pattern: a real route with its own
// data-fetching, using useHeaderConfig for the header instead of a modal.
// Doubles as the edit page (mirroring EventFormPage.tsx's two-routes-one-
// component pattern) when an `:itemId` route param is present — unlike
// EventFormPage, edit mode here fetches the item by id (GET /:itemId)
// instead of relying only on router state, so it survives a direct
// reload/deep link the way ListItemDetailPage does.
export function ListItemFormPage() {
  const { childId, itemId } = useParams<{ childId: string; itemId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEditing = Boolean(itemId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // In create mode the type comes from the ?type= query param; in edit mode
  // it comes from the fetched item itself (below) and can't be changed.
  const [type, setType] = useState<ListItemType>(
    searchParams.get("type") === "WISHLIST" ? "WISHLIST" : "NECESSITY"
  );

  useHeaderConfig(
    {
      title: isEditing
        ? `Edit ${type === "WISHLIST" ? "Wishlist Item" : "Necessity"}`
        : type === "NECESSITY"
          ? "Add to Necessities"
          : "Add to Wishlist",
      backTo: isEditing ? `/children/${childId}/lists/${itemId}` : "/lists",
    },
    [type, isEditing]
  );

  const [child, setChild] = useState<ChildDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sizeValue, setSizeValue] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [imageAssetId, setImageAssetId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Wishlist-only "attach to a calendar event" section.
  const [eventMode, setEventMode] = useState<"none" | "new" | "existing">("none");
  const [eventTitle, setEventTitle] = useState("");
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [existingEvents, setExistingEvents] = useState<CalendarEventDto[]>([]);
  const [existingEventsLoading, setExistingEventsLoading] = useState(false);
  const [selectedExistingEventId, setSelectedExistingEventId] = useState("");
  const [currentLinkedEvent, setCurrentLinkedEvent] = useState<CalendarEventDto | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      apiGet<ChildDetail>(`/children/${childId}`),
      apiGet<{ members: ChildFamilyMember[] }>(`/children/${childId}/family`),
      itemId ? apiGet<ListItemDto>(`/children/${childId}/lists/${itemId}`) : Promise.resolve(null),
    ])
      .then(async ([childRes, familyRes, itemRes]) => {
        if (cancelled) return;
        setChild(childRes);
        setMembers(familyRes.members);
        if (itemRes) {
          setType(itemRes.type);
          setTitle(itemRes.title);
          setDescription(itemRes.description ?? "");
          setSizeValue(itemRes.sizeValue ?? "");
          setAssignedToId(itemRes.assignedToId ?? "");
          setImageAssetId(itemRes.imageAssetId);
          if (itemRes.type === "WISHLIST" && itemRes.calendarEventId) {
            try {
              const event = await apiGet<CalendarEventDto>(
                `/children/${childId}/calendar-events/${itemRes.calendarEventId}`
              );
              if (cancelled) return;
              setCurrentLinkedEvent(event);
              setEventMode("existing");
              setSelectedExistingEventId(event.id);
            } catch {
              // Linked event vanished (e.g. deleted directly) — treat as unlinked.
            }
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiRequestError ? err.message : "Couldn't load this item");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [childId, itemId]);

  // Fetch the picker options once "existing" is chosen, so a fresh event
  // created elsewhere shows up without needing to reload this page.
  useEffect(() => {
    if (eventMode !== "existing" || !childId) return;
    let cancelled = false;
    setExistingEventsLoading(true);
    apiGet<{ items: CalendarEventDto[] }>(`/children/${childId}/calendar-events?linkedToWishlist=1`)
      .then((res) => {
        if (!cancelled) setExistingEvents(res.items);
      })
      .catch(() => {
        if (!cancelled) setExistingEvents([]);
      })
      .finally(() => {
        if (!cancelled) setExistingEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventMode, childId]);

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingImage(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const asset = await apiUpload<MediaUploadResponse>("/media/upload", formData);
      setImageAssetId(asset.id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't upload that photo");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !childId) return;
    setSubmitting(true);
    setError(null);
    try {
      let calendarEventId: string | null | undefined;
      if (type === "WISHLIST" && eventMode === "new" && eventStartDate) {
        const startsAt = new Date(
          `${eventStartDate}T${eventAllDay ? "00:00" : eventStartTime || "00:00"}:00`
        ).toISOString();
        const endsAt = new Date(
          `${eventEndDate || eventStartDate}T${eventAllDay ? "00:00" : eventEndTime || eventStartTime || "00:00"}:00`
        ).toISOString();
        const event = await apiPost<CalendarEventDto>(`/children/${childId}/calendar-events`, {
          category: "APPOINTMENT",
          title: eventTitle.trim() || title.trim(),
          startsAt,
          endsAt,
          allDay: eventAllDay,
        } satisfies CreateCalendarEventRequest);
        calendarEventId = event.id;
      } else if (type === "WISHLIST" && eventMode === "existing" && selectedExistingEventId) {
        calendarEventId = selectedExistingEventId;
      } else if (type === "WISHLIST" && eventMode === "none" && isEditing) {
        // Editing and deliberately switched off — explicit null clears it.
        calendarEventId = null;
      }

      if (isEditing) {
        await apiPatch<ListItemDto>(`/children/${childId}/lists/${itemId}`, {
          title: title.trim(),
          description: description.trim() || null,
          sizeValue: type === "NECESSITY" ? sizeValue.trim() || null : undefined,
          assignedToId: type === "NECESSITY" ? assignedToId || null : undefined,
          calendarEventId,
          imageAssetId,
        } satisfies UpdateListItemRequest);
        navigate(`/children/${childId}/lists/${itemId}`, { replace: true });
      } else {
        await apiPost<ListItemDto>(`/children/${childId}/lists`, {
          type,
          title: title.trim(),
          description: description.trim() || undefined,
          sizeValue: type === "NECESSITY" ? sizeValue.trim() || undefined : undefined,
          assignedToId: type === "NECESSITY" ? assignedToId || undefined : undefined,
          calendarEventId: calendarEventId ?? undefined,
          imageAssetId: imageAssetId ?? undefined,
        } satisfies CreateListItemRequest);
        navigate(`/lists?child=${childId}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save that item — try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
      </section>
    );
  }

  if (loadError || !child || !childId) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
          {loadError ?? "Couldn't load this child"}
        </p>
      </section>
    );
  }

  const childSizeHint = child.clothingSize ?? child.shoeSize ?? null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col w-full min-h-screen">
      <div className="flex-1 overflow-y-auto px-container-padding py-section-margin flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <ListItemImage
            imageAssetId={imageAssetId}
            alt={title}
            className="w-20 h-20 rounded-xl shrink-0"
            fallback={
              <div className="w-20 h-20 rounded-xl bg-surface-container flex items-center justify-center shrink-0">
                <Icon name={type === "WISHLIST" ? "redeem" : "checkroom"} className="text-on-surface-variant text-3xl" />
              </div>
            }
          />
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className="py-2 px-4 rounded-full bg-surface-container text-primary font-label-sm text-label-sm disabled:opacity-60"
            >
              {uploadingImage ? "Uploading…" : imageAssetId ? "Replace photo" : "Add photo"}
            </button>
            {imageAssetId && (
              <button
                type="button"
                onClick={() => setImageAssetId(null)}
                className="py-2 px-4 rounded-full text-error font-label-sm text-label-sm"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Item, e.g. Winter coat"
          className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
          required
          autoFocus={!isEditing}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md resize-none"
        />

        {type === "NECESSITY" && (
          <>
            <input
              value={sizeValue}
              onChange={(e) => setSizeValue(e.target.value)}
              placeholder={childSizeHint ? `Size (e.g. ${childSizeHint})` : "Size (optional)"}
              className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
            />
            <label className="flex flex-col gap-1 font-label-md text-label-md text-text-main">
              Assign to (optional)
              <select
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                className="bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Still Needed (unassigned)</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {type === "WISHLIST" && (
          <div className="bg-surface-container-lowest rounded-xl p-4 flex flex-col gap-3">
            <span className="font-label-md text-label-md text-on-surface">Calendar event (optional)</span>

            <div className="flex p-1 bg-surface-container-high rounded-full w-full">
              {(["none", "new", "existing"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEventMode(mode)}
                  className={`flex-1 py-2 text-center rounded-full font-label-sm text-label-sm transition-colors ${
                    eventMode === mode ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant"
                  }`}
                >
                  {mode === "none" ? "None" : mode === "new" ? "New event" : "Existing event"}
                </button>
              ))}
            </div>

            {eventMode === "new" && (
              <div className="flex flex-col gap-3">
                <input
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder={`Event title (defaults to "${title.trim() || "this item"}")`}
                  className="w-full bg-surface-container rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
                />
                <label className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">All-day</span>
                  <Toggle
                    checked={eventAllDay}
                    onToggle={() => setEventAllDay((v) => !v)}
                    offColor="bg-surface-container-high"
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Starts</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={eventStartDate}
                      onChange={(e) => setEventStartDate(e.target.value)}
                      required={eventMode === "new"}
                      className="flex-1 px-3 py-2 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
                    />
                    {!eventAllDay && (
                      <input
                        type="time"
                        value={eventStartTime}
                        onChange={(e) => setEventStartTime(e.target.value)}
                        className="flex-1 px-3 py-2 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Ends</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={eventEndDate}
                      onChange={(e) => setEventEndDate(e.target.value)}
                      min={eventStartDate}
                      className="flex-1 px-3 py-2 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
                    />
                    {!eventAllDay && (
                      <input
                        type="time"
                        value={eventEndTime}
                        onChange={(e) => setEventEndTime(e.target.value)}
                        className="flex-1 px-3 py-2 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
                      />
                    )}
                  </div>
                </div>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  This will also add an event to the Calendar.
                </p>
              </div>
            )}

            {eventMode === "existing" && (
              <div className="flex flex-col gap-2">
                {currentLinkedEvent && selectedExistingEventId === currentLinkedEvent.id && (
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    Currently linked to "{currentLinkedEvent.title}" —{" "}
                    {new Date(currentLinkedEvent.startsAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                    .
                  </p>
                )}
                <select
                  value={selectedExistingEventId}
                  onChange={(e) => setSelectedExistingEventId(e.target.value)}
                  className="w-full bg-surface-container rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
                >
                  <option value="">
                    {existingEventsLoading ? "Loading events…" : "Choose an event"}
                  </option>
                  {existingEvents.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title} —{" "}
                      {new Date(event.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </option>
                  ))}
                </select>
                {!existingEventsLoading && existingEvents.length === 0 && (
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    No existing wishlist-linked events yet — create one with "New event" instead.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
        )}
      </div>

      <div className="sticky bottom-24 z-30 px-container-padding pt-3">
        <button
          type="submit"
          disabled={!title.trim() || submitting}
          className="w-full py-4 bg-primary text-on-primary rounded-full font-label-md text-label-md shadow-lg disabled:opacity-60"
        >
          {submitting ? "Saving…" : isEditing ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}
