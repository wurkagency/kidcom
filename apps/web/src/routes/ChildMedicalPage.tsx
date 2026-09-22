import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  CalendarEventDto,
  CalendarRangeResponse,
  ChildDetail,
  ChildScheduleResponse,
  CreateMedicalInfoRequest,
  MedicalInfoCategory,
  MedicalInfoEntry,
  ScheduleItem,
  UpdateMedicalInfoRequest,
  UpdateScheduleOccurrenceRequest,
} from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { apiDelete, apiGet, apiPatch, apiPost, ApiRequestError } from "../lib/api";

function toDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type ScheduleGroup = {
  templateId: string;
  label: string;
  description: string | null;
  provider: string | null;
  ageInMonths: number;
  isRecurring: boolean;
  items: ScheduleItem[];
};

// Groups the flat ScheduleItem[] (one row per occurrence) back into one
// entry per template, in the order the API already sorts them (by
// ageInMonths, then occurrence sequence within a template).
function groupScheduleItems(items: ScheduleItem[]): ScheduleGroup[] {
  const groups: ScheduleGroup[] = [];
  const byTemplate = new Map<string, ScheduleGroup>();
  for (const item of items) {
    let group = byTemplate.get(item.templateId);
    if (!group) {
      group = {
        templateId: item.templateId,
        label: item.label,
        description: item.description,
        provider: item.provider,
        ageInMonths: item.ageInMonths,
        isRecurring: item.isRecurring,
        items: [],
      };
      byTemplate.set(item.templateId, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

// Matches docs/stitch_splitkid/medical_info_schedules/code.html. The
// "Appointments" section used to be a placeholder note ("needs the
// Calendar, a later chunk") left over from chunk 3 — the calendar has been
// built (and re-verified) since chunk 4, so this now pulls real upcoming
// appointments the same way HomePage/CalendarPage do. Only MEDICAL-category
// events show here (replaces the old APPOINTMENT + isMedical boolean check,
// now that Medical is its own real category) — every other category
// (school events, activities, plain appointments, ...) stays out, since
// this is the child's Health page, not a full agenda.
export function ChildMedicalPage() {
  const { childId } = useParams<{ childId: string }>();
  const [child, setChild] = useState<ChildDetail | null>(null);
  const [info, setInfo] = useState<MedicalInfoEntry[]>([]);
  const [schedule, setSchedule] = useState<ChildScheduleResponse | null>(null);
  const [appointments, setAppointments] = useState<CalendarEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    async function load() {
      try {
        const today = new Date();
        const start = toDateOnly(today);
        const end = toDateOnly(new Date(today.getTime() + 60 * 86400000));
        const [childRes, infoRes, scheduleRes, calendarRes] = await Promise.all([
          apiGet<ChildDetail>(`/children/${childId}`),
          apiGet<{ items: MedicalInfoEntry[] }>(`/children/${childId}/medical-info`),
          apiGet<ChildScheduleResponse>(`/children/${childId}/schedule`),
          apiGet<CalendarRangeResponse>(`/children/${childId}/calendar?start=${start}&end=${end}`),
        ]);
        if (cancelled) return;
        setChild(childRes);
        setInfo(infoRes.items);
        setSchedule(scheduleRes);
        const now = Date.now();
        setAppointments(
          calendarRes.events
            .filter((e) => e.category === "MEDICAL" && new Date(e.startsAt).getTime() >= now)
            .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : "Couldn't load medical info");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  async function refreshInfo() {
    if (!childId) return;
    const refreshed = await apiGet<{ items: MedicalInfoEntry[] }>(`/children/${childId}/medical-info`);
    setInfo(refreshed.items);
  }

  async function updateOccurrence(templateId: string, sequence: number, patch: UpdateScheduleOccurrenceRequest) {
    if (!childId) return;
    try {
      await apiPatch(`/children/${childId}/schedule/${templateId}/occurrences/${sequence}`, patch);
      const refreshed = await apiGet<ChildScheduleResponse>(`/children/${childId}/schedule`);
      setSchedule(refreshed);
    } catch {
      setError("Couldn't update that item — try again.");
    }
  }

  async function handleDelete(entry: MedicalInfoEntry) {
    if (!childId) return;
    if (!window.confirm(`Remove "${entry.condition}"?`)) return;
    setBusyId(entry.id);
    try {
      await apiDelete(`/children/${childId}/medical-info/${entry.id}`);
      setInfo((prev) => prev.filter((i) => i.id !== entry.id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't remove that entry");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
      </section>
    );
  }

  if (error || !child) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-error">{error ?? "Child not found"}</p>
      </section>
    );
  }

  const allergies = info.filter((i) => i.category === "ALLERGY");
  const conditions = info.filter((i) => i.category === "CONDITION");
  const percentComplete = schedule && schedule.totalCount > 0
    ? Math.round((schedule.completedCount / schedule.totalCount) * 100)
    : 0;
  // One card per template, each listing its occurrence row(s) — a recurring
  // template (the ongoing dental screening) can have several dated rows once
  // it's been completed at least once; every other template has exactly one.
  const scheduleGroups = groupScheduleItems(schedule?.items ?? []);

  return (
    <div className="flex flex-col w-full pb-8">
      <div className="px-container-padding py-section-margin bg-surface shadow-sm">
        <div className="flex items-center gap-element-gap">
          <div className="relative w-16 h-16 rounded-full overflow-hidden shadow-sm bg-surface-container-high flex items-center justify-center">
            <Icon name="child_care" className="text-2xl text-on-surface-variant" />
          </div>
          <div>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
              {child.firstName}'s Health
            </h1>
          </div>
        </div>
      </div>

      <div className="px-container-padding flex flex-col gap-section-margin mt-section-margin">
        <section className="flex flex-col gap-base">
          <div className="flex items-center justify-between">
            <h2 className="font-headline-md text-headline-md text-on-surface">Critical Information</h2>
            <button
              onClick={() => {
                setShowAdd(true);
                setEditingId(null);
              }}
              className="font-label-sm text-label-sm text-primary flex items-center gap-1"
            >
              <Icon name="add" className="text-[16px]" /> Add
            </button>
          </div>
          {allergies.length === 0 && conditions.length === 0 && !showAdd && (
            <p className="font-body-md text-body-md text-on-surface-variant">
              Nothing logged yet.
            </p>
          )}
          {allergies.map((entry) =>
            editingId === entry.id ? (
              <MedicalInfoForm
                key={entry.id}
                childId={childId!}
                initial={entry}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await refreshInfo();
                }}
              />
            ) : (
              <div
                key={entry.id}
                className="bg-alert-soft-red rounded-[1.5rem] p-container-padding shadow-sm relative overflow-hidden"
              >
                <div className="flex items-start gap-4 relative z-10">
                  <div className="p-2 bg-on-error rounded-full flex items-center justify-center shrink-0">
                    <Icon name="medical_information" className="text-error" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-label-md text-label-md text-on-error-container">
                      {entry.condition}
                    </h3>
                    {entry.description && (
                      <p className="font-body-md text-body-md text-on-error-container mt-1">
                        {entry.description}
                      </p>
                    )}
                    {entry.emergencyNote && (
                      <p className="font-body-md text-body-md text-on-error-container/80 mt-1 italic">
                        {entry.emergencyNote}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditingId(entry.id);
                        setShowAdd(false);
                      }}
                      className="w-8 h-8 flex items-center justify-center text-on-error-container"
                    >
                      <Icon name="edit" className="text-[16px]" />
                    </button>
                    <button
                      onClick={() => handleDelete(entry)}
                      disabled={busyId === entry.id}
                      className="w-8 h-8 flex items-center justify-center text-on-error-container disabled:opacity-60"
                    >
                      <Icon name="delete" className="text-[16px]" />
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
          {conditions.map((entry) =>
            editingId === entry.id ? (
              <MedicalInfoForm
                key={entry.id}
                childId={childId!}
                initial={entry}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await refreshInfo();
                }}
              />
            ) : (
              <div key={entry.id} className="bg-tertiary-fixed rounded-[1.5rem] p-container-padding shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-on-tertiary rounded-full flex items-center justify-center shrink-0">
                    <Icon name="air" className="text-tertiary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-label-md text-label-md text-on-tertiary-fixed-variant">
                      {entry.condition}
                    </h3>
                    {entry.description && (
                      <p className="font-body-md text-body-md text-on-tertiary-fixed-variant mt-1">
                        {entry.description}
                      </p>
                    )}
                    {entry.emergencyNote && (
                      <p className="font-body-md text-body-md text-on-tertiary-fixed-variant/80 mt-1 italic">
                        {entry.emergencyNote}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditingId(entry.id);
                        setShowAdd(false);
                      }}
                      className="w-8 h-8 flex items-center justify-center text-on-tertiary-fixed-variant"
                    >
                      <Icon name="edit" className="text-[16px]" />
                    </button>
                    <button
                      onClick={() => handleDelete(entry)}
                      disabled={busyId === entry.id}
                      className="w-8 h-8 flex items-center justify-center text-on-tertiary-fixed-variant disabled:opacity-60"
                    >
                      <Icon name="delete" className="text-[16px]" />
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
          {showAdd && (
            <MedicalInfoForm
              childId={childId!}
              onCancel={() => setShowAdd(false)}
              onSaved={async () => {
                setShowAdd(false);
                await refreshInfo();
              }}
            />
          )}
        </section>

        <section className="flex flex-col gap-base">
          <h2 className="font-headline-md text-headline-md text-on-surface">Appointments</h2>
          {appointments.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-[1.5rem] p-4 shadow-sm">
              <p className="font-body-md text-body-md text-on-surface-variant">
                No upcoming medical appointments in the next 60 days.
              </p>
              <Link to="/calendar" className="font-label-md text-label-md text-primary mt-2 inline-block">
                Add one on the Calendar
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {appointments.map((appt) => (
                <Link
                  key={appt.id}
                  to="/calendar"
                  className="bg-surface-container-lowest rounded-[1.5rem] p-4 shadow-sm flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-label-md text-label-md text-on-surface truncate">{appt.title}</p>
                    <p className="font-body-md text-[14px] text-on-surface-variant">
                      {new Date(appt.startsAt).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                      {!appt.allDay &&
                        ` · ${new Date(appt.startsAt).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}`}
                    </p>
                  </div>
                  <Icon name="event" className="text-tertiary shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-base">
          <h2 className="font-headline-md text-headline-md text-on-surface">Medical Progress</h2>
          <div className="bg-surface-container-lowest rounded-[1.5rem] p-container-padding shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="font-label-md text-label-md text-on-surface-variant">
                {child.countryCode} default schedule
              </span>
              <span className="font-label-md text-label-md text-primary">
                {percentComplete}% Complete
              </span>
            </div>
            <div className="w-full h-3 bg-surface-container rounded-full overflow-hidden mb-6">
              <div className="h-full bg-primary rounded-full" style={{ width: `${percentComplete}%` }} />
            </div>
            <div className="flex flex-col gap-5">
              {scheduleGroups.map((group) => (
                <div key={group.templateId} className="flex flex-col gap-2">
                  <div>
                    <p className="font-label-md text-label-md text-on-surface">{group.label}</p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      {[group.provider, `Recommended around ${group.ageInMonths} months`]
                        .filter(Boolean)
                        .join(" · ")}
                      {group.isRecurring ? " · Repeats every 12 months" : ""}
                    </p>
                    {group.description && (
                      <p className="font-body-md text-[13px] text-on-surface-variant mt-0.5">
                        {group.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 pl-1">
                    {group.items.map((item) => (
                      <div key={item.sequence} className="flex items-center gap-3">
                        <button
                          onClick={() => updateOccurrence(item.templateId, item.sequence, { completed: !item.completed })}
                          aria-label={item.completed ? "Mark not completed" : "Mark completed"}
                          className="shrink-0"
                        >
                          <Icon
                            name={item.completed ? "check_circle" : "radio_button_unchecked"}
                            className={item.completed ? "text-primary" : "text-outline"}
                          />
                        </button>
                        <div className="flex-1 flex items-center justify-between gap-3">
                          <span className="font-label-sm text-label-sm text-on-surface-variant">
                            {group.isRecurring
                              ? item.completed
                                ? `Completed ${new Date(item.completedAt!).toLocaleDateString()}`
                                : "Planned"
                              : item.completed
                                ? `Completed ${new Date(item.completedAt!).toLocaleDateString()}`
                                : "Planned date"}
                          </span>
                          <input
                            type="date"
                            value={item.plannedAt ? item.plannedAt.slice(0, 10) : ""}
                            onChange={(e) =>
                              updateOccurrence(item.templateId, item.sequence, {
                                plannedAt: e.target.value || null,
                              })
                            }
                            className="bg-surface-container rounded-lg px-2 py-1 text-[13px] outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {scheduleGroups.length === 0 && (
                <p className="font-body-md text-body-md text-on-surface-variant">
                  No schedule template loaded for {child.countryCode} yet.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// Small toggle-to-edit inline form, matching CustodySetup/ListsPage's style —
// used both for "Add" (no `initial`) and "Edit" (with `initial`) since the
// two share every field.
function MedicalInfoForm({
  childId,
  initial,
  onCancel,
  onSaved,
}: {
  childId: string;
  initial?: MedicalInfoEntry;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<MedicalInfoCategory>(initial?.category ?? "ALLERGY");
  const [condition, setCondition] = useState(initial?.condition ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [emergencyNote, setEmergencyNote] = useState(initial?.emergencyNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!condition.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await apiPatch(`/children/${childId}/medical-info/${initial.id}`, {
          category,
          condition: condition.trim(),
          description: description.trim() || undefined,
          emergencyNote: emergencyNote.trim() || undefined,
        } satisfies UpdateMedicalInfoRequest);
      } else {
        await apiPost(`/children/${childId}/medical-info`, {
          category,
          condition: condition.trim(),
          description: description.trim() || undefined,
          emergencyNote: emergencyNote.trim() || undefined,
        } satisfies CreateMedicalInfoRequest);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save that entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-container rounded-2xl p-4 flex flex-col gap-3 shadow-sm"
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setCategory("ALLERGY")}
          className={`flex-1 py-2 rounded-full font-label-sm text-label-sm ${
            category === "ALLERGY" ? "bg-error text-on-error" : "bg-surface-container-lowest text-on-surface-variant"
          }`}
        >
          Allergy
        </button>
        <button
          type="button"
          onClick={() => setCategory("CONDITION")}
          className={`flex-1 py-2 rounded-full font-label-sm text-label-sm ${
            category === "CONDITION" ? "bg-tertiary text-on-tertiary" : "bg-surface-container-lowest text-on-surface-variant"
          }`}
        >
          Condition
        </button>
      </div>
      <input
        value={condition}
        onChange={(e) => setCondition(e.target.value)}
        placeholder="Condition, e.g. Peanut allergy"
        className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
        required
        autoFocus
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
      />
      <input
        value={emergencyNote}
        onChange={(e) => setEmergencyNote(e.target.value)}
        placeholder="Emergency note (optional)"
        className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
      />
      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-md text-label-md"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !condition.trim()}
          className="flex-1 py-3 rounded-full bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
