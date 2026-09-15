import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CalendarEventDto, CreateCalendarEventRequest, UpdateCalendarEventRequest } from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Toggle } from "../components/Toggle";
import { apiDelete, apiGet, apiPatch, apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { CALENDAR_CATEGORY_META, CALENDAR_WRITABLE_CATEGORIES } from "../lib/calendarCategories";

// Matches docs/stitch_splitkid/calendar_{month,week,list}_view's event
// detail fields: full-screen Cancel/Save header, title input, an "Assigned
// To" child picker, real category chips, all-day toggle, starts/ends,
// location/notes, an optional contact card, a short checklist editor, and a
// "confirmable" toggle. Used for both creating a new event and editing an
// existing one — edit mode fetches the event by id (GET
// /calendar-events/:id) on mount instead of depending on router state, so a
// page refresh mid-edit no longer loses the event and bounces to /calendar.
type ChecklistDraftItem = { key: string; label: string };

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

let checklistKeySeq = 0;
function nextChecklistKey(): string {
  checklistKeySeq += 1;
  return `checklist-${checklistKeySeq}`;
}

export function EventFormPage() {
  const { childId, eventId } = useParams<{ childId: string; eventId?: string }>();
  const navigate = useNavigate();
  const { children } = useAuth();
  const isEditing = Boolean(eventId);

  const [editingEvent, setEditingEvent] = useState<CalendarEventDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(isEditing);

  useEffect(() => {
    if (!isEditing || !childId || !eventId) return;
    let cancelled = false;
    apiGet<CalendarEventDto>(`/children/${childId}/calendar-events/${eventId}`)
      .then((event) => {
        if (!cancelled) setEditingEvent(event);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiRequestError ? err.message : "Couldn't load that event");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEvent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEditing, childId, eventId]);

  const now = new Date();
  const nowDate = now.toISOString().slice(0, 10);
  const nowTime = now.toTimeString().slice(0, 5);

  const [assignedChildIds, setAssignedChildIds] = useState<string[]>(() =>
    childId ? [childId] : children[0] ? [children[0].id] : []
  );
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CreateCalendarEventRequest["category"]>("APPOINTMENT");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState(nowDate);
  const [startTime, setStartTime] = useState(nowTime);
  const [endDate, setEndDate] = useState(nowDate);
  const [endTime, setEndTime] = useState(nowTime);
  const [location_, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedNote, setAssignedNote] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactDetail, setContactDetail] = useState("");
  const [confirmable, setConfirmable] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistDraftItem[]>([]);
  const [newChecklistLabel, setNewChecklistLabel] = useState("");
  const [repeatIntervalWeeks, setRepeatIntervalWeeks] = useState<number | null>(null);
  const [repeatUntil, setRepeatUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once the event loads (edit mode), seed every field from it — mirrors
  // the old useState(editingEvent?.x ?? default) pattern, just deferred
  // until the fetch resolves instead of running at mount time.
  useEffect(() => {
    if (!editingEvent) return;
    setTitle(editingEvent.title);
    setCategory(editingEvent.category === "HOLIDAY" ? "PLANNED_HOLIDAY" : editingEvent.category);
    setAllDay(editingEvent.allDay);
    setStartDate(toDateInput(editingEvent.startsAt));
    setStartTime(toTimeInput(editingEvent.startsAt));
    setEndDate(editingEvent.endsAt ? toDateInput(editingEvent.endsAt) : toDateInput(editingEvent.startsAt));
    setEndTime(editingEvent.endsAt ? toTimeInput(editingEvent.endsAt) : toTimeInput(editingEvent.startsAt));
    setLocation(editingEvent.location ?? "");
    setNotes(editingEvent.notes ?? "");
    setAssignedNote(editingEvent.assignedNote ?? "");
    setContactName(editingEvent.contactName ?? "");
    setContactDetail(editingEvent.contactDetail ?? "");
    setConfirmable(editingEvent.confirmable);
    setChecklist(editingEvent.checklist.map((item) => ({ key: item.id, label: item.label })));
    setRepeatIntervalWeeks(editingEvent.recurrenceIntervalWeeks);
    setRepeatUntil(editingEvent.recurrenceEndsAt ? toDateInput(editingEvent.recurrenceEndsAt) : "");
  }, [editingEvent]);

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

  function addChecklistItem() {
    const label = newChecklistLabel.trim();
    if (!label) return;
    setChecklist((prev) => [...prev, { key: nextChecklistKey(), label }]);
    setNewChecklistLabel("");
  }

  function removeChecklistItem(key: string) {
    setChecklist((prev) => prev.filter((item) => item.key !== key));
  }

  async function handleSave() {
    if (!title.trim() || assignedChildIds.length === 0) return;
    setError(null);
    setSaving(true);
    try {
      const startsAt = new Date(`${startDate}T${allDay ? "00:00" : startTime}:00`).toISOString();
      // Always derive endsAt from endDate — including all-day events, which
      // previously dropped it entirely (endsAt: undefined) so a multi-day
      // all-day event silently collapsed to a single day. All-day end uses
      // start-of-day on endDate, matching startsAt's own all-day convention;
      // the calendar views' eventSpansDate treats the end date inclusively
      // so end-of-day isn't needed.
      const endsAt = new Date(`${endDate}T${allDay ? "00:00" : endTime}:00`).toISOString();
      const payload: CreateCalendarEventRequest = {
        category,
        title: title.trim(),
        startsAt,
        endsAt,
        allDay,
        notes: notes.trim() || undefined,
        location: location_.trim() || undefined,
        assignedNote: assignedNote.trim() || undefined,
        contactName: contactName.trim() || undefined,
        contactDetail: contactDetail.trim() || undefined,
        confirmable,
        checklist: checklist.map((item) => ({ label: item.label })),
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

  if (isEditing && loadingEvent) {
    return (
      <div className="flex flex-col w-full min-h-screen bg-surface px-container-padding py-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
      </div>
    );
  }

  if (isEditing && !editingEvent) {
    return (
      <div className="flex flex-col w-full min-h-screen bg-surface px-container-padding py-6 gap-4">
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
          {loadError ?? "That event couldn't be found."}
        </p>
        <button
          onClick={() => navigate("/calendar")}
          className="w-full py-3 rounded-full bg-surface-container text-primary font-label-md text-label-md"
        >
          Back to calendar
        </button>
      </div>
    );
  }

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
            {CALENDAR_WRITABLE_CATEGORIES.map((value) => {
              const meta = CALENDAR_CATEGORY_META[value];
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  className={`px-4 py-2 rounded-full font-label-md text-label-md flex items-center gap-2 transition-colors ${
                    category === value ? "bg-primary/10 text-primary" : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                  {meta.label}
                </button>
              );
            })}
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
            <Toggle checked={allDay} onToggle={() => setAllDay((v) => !v)} offColor="bg-surface-container-high" />
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
          <div className="h-px w-full bg-surface-variant ml-4 max-w-[calc(100%-16px)]" />
          <div className="flex items-center justify-between p-4">
            <span className="font-body-md text-body-md text-on-surface">Ends</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="px-3 py-1.5 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
              />
              {!allDay && (
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="px-3 py-1.5 bg-surface-container rounded-lg font-label-md text-label-md text-on-surface-variant outline-none"
                />
              )}
            </div>
          </div>
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
          <div className="flex items-center p-2">
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0 ml-2">
              <Icon name="badge" />
            </div>
            <input
              value={assignedNote}
              onChange={(e) => setAssignedNote(e.target.value)}
              placeholder="Assigned note (e.g. Leo & Maya)"
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

        <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm flex flex-col gap-3">
          <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
            Contact (optional)
          </label>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Contact name (e.g. Dr. Andersen)"
            className="w-full bg-surface-container rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline-variant outline-none"
          />
          <input
            value={contactDetail}
            onChange={(e) => setContactDetail(e.target.value)}
            placeholder="Phone, address, or other detail"
            className="w-full bg-surface-container rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline-variant outline-none"
          />
        </div>

        <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm flex flex-col gap-3">
          <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
            Checklist (optional)
          </label>
          {checklist.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <Icon name="check_box_outline_blank" className="text-[18px] text-on-surface-variant" />
              <span className="flex-1 font-body-md text-body-md text-on-surface">{item.label}</span>
              <button
                type="button"
                onClick={() => removeChecklistItem(item.key)}
                aria-label={`Remove ${item.label}`}
                className="text-on-surface-variant"
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              value={newChecklistLabel}
              onChange={(e) => setNewChecklistLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addChecklistItem();
                }
              }}
              placeholder="Bring: swim bag"
              className="flex-1 bg-surface-container rounded-xl px-4 py-2.5 font-body-md text-body-md text-on-surface placeholder:text-outline-variant outline-none"
            />
            <button
              type="button"
              onClick={addChecklistItem}
              disabled={!newChecklistLabel.trim()}
              className="py-2.5 px-4 rounded-xl bg-surface-container text-primary font-label-md text-label-md disabled:opacity-60"
            >
              Add
            </button>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-3xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="font-body-md text-body-md text-on-surface">Allow confirmation</p>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              Family members can mark themselves as confirmed for this event.
            </p>
          </div>
          <Toggle
            checked={confirmable}
            onToggle={() => setConfirmable((v) => !v)}
            offColor="bg-surface-container-high"
          />
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
