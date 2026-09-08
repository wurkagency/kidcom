import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type {
  CalendarEventDto,
  ChildDetail,
  ChildFamilyMember,
  CreateCalendarEventRequest,
  CreateListItemRequest,
  ListItemDto,
  ListItemType,
} from "@kidcom/shared";

import { apiGet, apiPost, ApiRequestError } from "../lib/api";
import { useHeaderConfig } from "../lib/HeaderContext";

type Member = { userId: string; firstName: string; lastName: string; avatarUrl: string | null };

// Full-page replacement for ListsPage's old AddItemSheet bottom-sheet modal,
// which rendered outside the viewport on real devices and made it impossible
// to post to either list. Mirrors JournalComposePage.tsx's pattern: a real
// route (/children/:childId/lists/new?type=NECESSITY|WISHLIST) with its own
// data-fetching, using useHeaderConfig for the header instead of a modal —
// so it survives a direct reload/deep link the way the old modal never could.
export function ListItemFormPage() {
  const { childId } = useParams<{ childId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const type: ListItemType = searchParams.get("type") === "WISHLIST" ? "WISHLIST" : "NECESSITY";

  useHeaderConfig(
    { title: type === "NECESSITY" ? "Add to Necessities" : "Add to Wishlist", backTo: "/lists" },
    [type]
  );

  const [child, setChild] = useState<ChildDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sizeValue, setSizeValue] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [addDate, setAddDate] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
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
    ])
      .then(([childRes, familyRes]) => {
        if (cancelled) return;
        setChild(childRes);
        setMembers(familyRes.members);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiRequestError ? err.message : "Couldn't load this child");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !childId) return;
    setSubmitting(true);
    setError(null);
    try {
      let calendarEventId: string | undefined;
      if (type === "WISHLIST" && addDate && eventDate) {
        const allDay = !eventTime;
        const startsAt = new Date(`${eventDate}T${allDay ? "00:00" : eventTime}:00`).toISOString();
        const event = await apiPost<CalendarEventDto>(`/children/${childId}/calendar-events`, {
          category: "APPOINTMENT",
          title: title.trim(),
          startsAt,
          endsAt: startsAt,
          allDay,
        } satisfies CreateCalendarEventRequest);
        calendarEventId = event.id;
      }

      await apiPost<ListItemDto>(`/children/${childId}/lists`, {
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        sizeValue: type === "NECESSITY" ? sizeValue.trim() || undefined : undefined,
        assignedToId: type === "NECESSITY" ? assignedToId || undefined : undefined,
        calendarEventId,
      } satisfies CreateListItemRequest);

      navigate(`/lists?child=${childId}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't add that item — try again");
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
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Item, e.g. Winter coat"
          className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
          required
          autoFocus
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
            <label className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface">
                Add a date (e.g. birthday)
              </span>
              <button
                type="button"
                aria-pressed={addDate}
                onClick={() => setAddDate((v) => !v)}
                className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${
                  addDate ? "bg-primary" : "bg-surface-container-high"
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full transition-transform duration-300 ${
                    addDate ? "translate-x-6 bg-on-primary" : "translate-x-1 bg-outline"
                  }`}
                />
              </button>
            </label>
            {addDate && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required={addDate}
                  className="flex-1 px-3 py-2 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
                />
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="flex-1 px-3 py-2 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
                />
              </div>
            )}
            {addDate && (
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                This will also add "{title.trim() || "this item"}" to the Calendar on that date.
              </p>
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
          {submitting ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}
