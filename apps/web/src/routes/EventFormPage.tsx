import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { CalendarEventDto, CreateCalendarEventRequest, UpdateCalendarEventRequest } from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { apiDelete, apiPatch, apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Matches docs/stitch_splitkid/add_new_event/code.html: full-screen
// Cancel/Save header, title input, an "Assigned To" child picker, category
// chips, an all-day toggle, starts/ends, location and notes. Used for both
// creating a new event and editing an existing one (the calendar has no
// GET-single-event endpoint, so editing carries the event over via router
// state from CalendarPage rather than re-fetching it here).
type FormCategory = "APPOINTMENT" | "MEDICAL" | "SPORT" | "PLANNED_HOLIDAY";

const CATEGORY_OPTIONS: { value: FormCategory; label: string; dotClass: string }[] = [
  { value: "APPOINTMENT", label: "Appointment", dotClass: "bg-primary" },
  { value: "MEDICAL", label: "Medical", dotClass: "bg-tertiary" },
  { value: "SPORT", label: "Sport", dotClass: "bg-secondary" },
  { value: "PLANNED_HOLIDAY", label: "Holiday", dotClass: "bg-journal-peach" },
];

// Every N weeks, matching the "each week / every 2nd week" asks — the
// series' own anchor date supplies which weekday it lands on, so this is
// the only knob needed for a plain weekly-style recurrence.
const REPEAT_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Does not repeat" },
  { value: 1, label: "Every week" },
  { value: 2, label: "Every 2 weeks" },
  { value: 3, label: "Every 3 weeks" },
  { value: 4, label: "Every 4 weeks" },
];

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}
function toTimeInput(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

export function EventFormPage() {
  const { childId, eventId } = useParams<{ childId: string; eventId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { children } = useAuth();

  // Passed by CalendarPage when navigating here to edit — see the comment
  // above. If it's missing (e.g. a direct URL hit after a refresh) there's
  // no way to recover the event's data, so bounce back to the calendar
  // rather than showing a broken/empty edit form.
  const editingEvent = (location.state as { event?: CalendarEventDto } | null)?.event ?? null;
  const isEditing = Boolean(eventId);

  if (isEditing && !editingEvent) {
    navigate(childId ? `/calendar` : "/", { replace: true });
  }

  const now = new Date();
  const nowDate = now.toISOString().slice(0, 10);
  const nowTime = now.toTimeString().slice(0, 5);

  const [assignedChildIds, setAssignedChildIds] = useState<string[]>(() =>
    childId ? [childId] : children[0] ? [children[0].id] : []
  );
  const [title, setTitle] = useState(editingEvent?.title ?? "");
  const [category, setCategory] = useState<FormCategory>(() => {
    if (!editingEvent) return "APPOINTMENT";
    if (editingEvent.category === "PLANNED_HOLIDAY") return "PLANNED_HOLIDAY";
    if (editingEvent.isMedical) return "MEDICAL";
    if (editingEvent.isSport) return "SPORT";
    return "APPOINTMENT";
  });
  const [allDay, setAllDay] = useState(editingEvent?.allDay ?? false);
  const [startDate, setStartDate] = useState(editingEvent ? toDateInput(editingEvent.startsAt) : nowDate);
  const [startTime, setStartTime] = useState(editingEvent ? toTimeInput(editingEvent.startsAt) : nowTime);
  const [endDate, setEndDate] = useState(
    editingEvent?.endsAt ? toDateInput(editingEvent.endsAt) : editingEvent ? toDateInput(editingEvent.startsAt) : nowDate
  );
  const [endTime, setEndTime] = useState(editingEvent?.endsAt ? toTimeInput(editingEvent.endsAt) : nowTime);
  const [location_, setLocation] = useState(editingEvent?.location ?? "");
  const [notes, setNotes] = useState(editingEvent?.notes ?? "");
  const [repeatIntervalWeeks, setRepeatIntervalWeeks] = useState<number | null>(
    editingEvent?.recurrenceIntervalWeeks ?? null
  );
  const [repeatUntil, setRepeatUntil] = useState(
    editingEvent?.recurrenceEndsAt ? toDateInput(editingEvent.recurrenceEndsAt) : ""
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEditAssignment = !isEditing && children.length > 1;

  const canDelete = isEditing && editingEvent?.editable;

  function toggleChild(id: string) {
    if (id === "both") {
      setAssignedChildIds(children.map((c) => c.id));
      return;
    }
    setAssignedChildIds([id]);
  }

  const bothSelected = assignedChildIds.length === children.length && children.length > 1;

  async function handleSave() {
    if (!title.trim() || assignedChildIds.length === 0) return;
    setError(null);
    setSaving(true);
    try {
      const startsAt = new Date(`${startDate}T${allDay ? "00:00" : startTime}:00`).toISOString();
      const endsAt = allDay ? undefined : new Date(`${endDate}T${endTime}:00`).toISOString();
      const payload: CreateCalendarEventRequest = {
        category: category === "MEDICAL" || category === "SPORT" ? "APPOINTMENT" : category,
        title: title.trim(),
        startsAt,
        endsAt,
        allDay,
        notes: notes.trim() || undefined,
        location: location_.trim() || undefined,
        isMedical: category === "MEDICAL",
        isSport: category === "SPORT",
        // Explicit null (not undefined) so editing an event back down to
        // "Does not repeat" actually clears an existing series — see the
        // CreateCalendarEventRequest comment in shared/index.ts.
        recurrenceIntervalWeeks: repeatIntervalWeeks,
        recurrenceEndsAt: repeatIntervalWeeks && repeatUntil ? new Date(`${repeatUntil}T23:59:59`).toISOString() : null,
      };

      if (isEditing && editingEvent && childId) {
        await apiPatch(`/children/${childId}/calendar-events/${editingEvent.id}`, payload satisfies UpdateCalendarEventRequest);
      } else {
        // "Both" is implemented for real (not decorative): one create call
        // per selected child, same payload.
        await Promise.all(
          assignedChildIds.map((id) => apiPost(`/children/${id}/calendar-events`, payload))
        );
      }
      navigate("/calendar");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save that event — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEditing || !editingEvent || !childId) return;
    const confirmMessage = editingEvent.recurrenceIntervalWeeks
      ? `Delete "${editingEvent.title}" and all its repeats? This removes the whole series, not just this occurrence.`
      : `Delete "${editingEvent.title}"?`;
    if (!window.confirm(confirmMessage)) return;
    setDeleting(true);
    setError(null);
    try {
      await apiDelete(`/children/${childId}/calendar-events/${editingEvent.id}`);
      navigate("/calendar");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't delete that event — try again.");
      setDeleting(false);
    }
  }

  const availableChildren = useMemo(() => children, [children]);

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface">
      <div className="flex items-center justify-between px-container-padding py-4 sticky top-0 bg-surface/90 backdrop-blur z-10">
        <button
          onClick={() => navigate("/calendar")}
          className="text-secondary font-label-md hover:text-on-surface transition-colors active:opacity-70 px-2 py-2 -ml-2 rounded-full"
        >
          Cancel
        </button>
        <span className="font-headline-md text-headline-md text-on-surface">
          {isEditing ? "Edit Event" : "New Event"}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="bg-primary text-on-primary font-label-md px-6 py-2.5 rounded-full shadow-sm active:scale-95 transition-all disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="px-container-padding flex flex-col gap-6 mt-2 pb-12">
        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event Title"
          className="w-full bg-surface-container-lowest rounded-2xl px-6 py-5 font-headline-md text-headline-md text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
          autoFocus
        />

        {canEditAssignment && (
          <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm">
            <label className="font-label-sm text-label-sm text-on-surface-variant block mb-3 uppercase tracking-wider">
              Assigned To
            </label>
            <div className="flex gap-4">
              {availableChildren.map((c) => {
                const selected = assignedChildIds.length === 1 && assignedChildIds[0] === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleChild(c.id)}
                    className="flex flex-col items-center gap-2"
                  >
                    <div className="relative">
                      <Avatar
                        name={c.firstName}
                        avatarAssetId={c.profileImageUrl}
                        kind="child"
                        size="lg"
                        className={selected ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest" : "opacity-60"}
                      />
                      {selected && (
                        <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5">
                          <Icon name="check" className="text-[12px] text-on-primary" />
                        </div>
                      )}
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface">{c.firstName}</span>
                  </button>
                );
              })}
              <button type="button" onClick={() => toggleChild("both")} className="flex flex-col items-center gap-2">
                <div
                  className={`w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant ${
                    bothSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest" : "opacity-60"
                  }`}
                >
                  <Icon name="group" />
                </div>
                <span className="font-label-sm text-label-sm text-on-surface">Both</span>
              </button>
            </div>
          </div>
        )}

        <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm">
          <label className="font-label-sm text-label-sm text-on-surface-variant block mb-3 uppercase tracking-wider">
            Category
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCategory(opt.value)}
                className={`px-4 py-2 rounded-full font-label-md text-label-md flex items-center gap-2 transition-colors ${
                  category === opt.value
                    ? "bg-primary/10 text-primary"
                    : "bg-surface-container text-on-surface-variant"
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${opt.dotClass}`} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-3xl p-2 shadow-sm">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                <Icon name="schedule" />
              </div>
              <span className="font-body-md text-body-md text-on-surface">All-day</span>
            </div>
            <button
              type="button"
              aria-pressed={allDay}
              onClick={() => setAllDay((v) => !v)}
              className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${
                allDay ? "bg-primary" : "bg-surface-container-high"
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full transition-transform duration-300 ${
                  allDay ? "translate-x-6 bg-on-primary" : "translate-x-1 bg-outline"
                }`}
              />
            </button>
          </div>
          <div className="h-px w-full bg-surface-variant" />
          <div className="flex items-center justify-between p-4">
            <span className="font-body-md text-body-md text-on-surface">Starts</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
              />
              {!allDay && (
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="px-3 py-1.5 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
                />
              )}
            </div>
          </div>
          {!allDay && (
            <>
              <div className="h-px w-full bg-surface-variant ml-4 max-w-[calc(100%-16px)]" />
              <div className="flex items-center justify-between p-4">
                <span className="font-body-md text-body-md text-on-surface">Ends</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-1.5 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="px-3 py-1.5 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
                  />
                </div>
              </div>
            </>
          )}
          <div className="h-px w-full bg-surface-variant" />
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                <Icon name="sync" />
              </div>
              <span className="font-body-md text-body-md text-on-surface">Repeat</span>
            </div>
            <select
              value={repeatIntervalWeeks ?? ""}
              onChange={(e) => setRepeatIntervalWeeks(e.target.value ? Number(e.target.value) : null)}
              className="px-3 py-1.5 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
            >
              {REPEAT_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value ?? ""}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {repeatIntervalWeeks && (
            <>
              <div className="h-px w-full bg-surface-variant ml-4 max-w-[calc(100%-16px)]" />
              <div className="flex items-center justify-between p-4">
                <span className="font-body-md text-body-md text-on-surface">Repeat until</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={repeatUntil}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                    min={startDate}
                    className="px-3 py-1.5 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
                  />
                  {repeatUntil && (
                    <button
                      type="button"
                      onClick={() => setRepeatUntil("")}
                      className="text-on-surface-variant"
                      aria-label="Clear repeat-until date"
                    >
                      <Icon name="close" className="text-[18px]" />
                    </button>
                  )}
                </div>
              </div>
              {!repeatUntil && (
                <p className="px-4 pb-3 font-label-sm text-label-sm text-on-surface-variant">
                  No end date — repeats indefinitely.
                </p>
              )}
            </>
          )}
        </div>

        {editingEvent?.recurrenceIntervalWeeks && (
          <p className="font-label-sm text-label-sm text-on-surface-variant -mt-4 px-1">
            This is a repeating event. Editing or deleting it applies to the whole series, not just this occurrence.
          </p>
        )}

        <div className="bg-surface-container-lowest rounded-3xl p-2 shadow-sm">
          <div className="flex items-center p-2">
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0 ml-2">
              <Icon name="location_on" />
            </div>
            <input
              value={location_}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              className="w-full bg-transparent px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline-variant outline-none"
            />
          </div>
          <div className="h-px w-full bg-surface-variant ml-14 max-w-[calc(100%-56px)]" />
          <div className="flex items-start p-2 pb-4">
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0 mt-2 ml-2">
              <Icon name="notes" />
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes, packing lists, or reminders…"
              className="w-full bg-transparent px-4 py-4 font-body-md text-body-md text-on-surface placeholder:text-outline-variant outline-none resize-none min-h-[100px]"
            />
          </div>
        </div>

        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="w-full py-3 rounded-full bg-alert-soft-red/20 text-error font-label-md text-label-md disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete event"}
          </button>
        )}
      </div>
    </div>
  );
}
