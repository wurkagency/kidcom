import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  CalendarEventDto,
  CalendarRangeResponse,
  ChildFamilyMember,
  CreateCalendarEventRequest,
  ResolveSwapRequestRequest,
  SwapRequestDto,
} from "@kidcom/shared";

import { SwapRequestCard } from "../components/SwapRequestCard";
import { Icon } from "../components/Icon";
import { apiGet, apiPatch, apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Local calendar date (not UTC) — used only for "what is today" display
// purposes so a viewer west/east of UTC sees their own current day, not
// the UTC one. The custody-resolution math itself works in UTC-day terms
// internally (see packages/shared/src/custody.ts) and is unaffected.
function toLocalDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayIdx = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayIdx);
  return d;
}

const CATEGORY_ICON: Record<CalendarEventDto["category"], string> = {
  APPOINTMENT: "event",
  HOLIDAY: "celebration",
  PLANNED_HOLIDAY: "flight_takeoff",
};

// Matches docs/stitch_splitkid/calendar_custody/code.html: month header with
// week navigation, a 4-item legend, a 7-day strip, and a timeline of the
// selected day's events, plus the "Request Swap" card. Custody assignment
// per day comes from the computed schedule (packages/shared/src/custody.ts)
// rather than stored events — see the chunk 4 plan.
export function CalendarPage() {
  const { user, children } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const swapCardRef = useRef<HTMLDivElement>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(children[0]?.id);
  const [family, setFamily] = useState<ChildFamilyMember[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateOnly(new Date()));
  const [range, setRange] = useState<CalendarRangeResponse | null>(null);
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventTime, setEventTime] = useState("09:00");
  const [eventIsMedical, setEventIsMedical] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [swapRequests, setSwapRequests] = useState<SwapRequestDto[]>([]);
  const [resolvingSwapId, setResolvingSwapId] = useState<string | null>(null);

  const childId = selectedChildId ?? children[0]?.id;
  const weekStart = useMemo(() => startOfWeek(new Date(selectedDate)), [selectedDate]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setUTCDate(d.getUTCDate() + i);
        return d;
      }),
    [weekStart]
  );

  async function loadRange() {
    if (!childId) return;
    const start = toDateOnly(weekDays[0]);
    const end = toDateOnly(weekDays[6]);
    const [planRes, rangeRes, familyRes, swapRequestsRes] = await Promise.all([
      apiGet<{ plan: unknown }>(`/children/${childId}/custody-plan`),
      apiGet<CalendarRangeResponse>(`/children/${childId}/calendar?start=${start}&end=${end}`),
      apiGet<{ members: ChildFamilyMember[] }>(`/children/${childId}/family`),
      apiGet<{ items: SwapRequestDto[] }>(`/children/${childId}/swap-requests`),
    ]);
    setHasPlan(planRes.plan !== null);
    setRange(rangeRes);
    setFamily(familyRes.members);
    setSwapRequests(swapRequestsRes.items);
  }

  useEffect(() => {
    if (!childId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRange()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : "Couldn't load the calendar");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, weekStart.getTime()]);

  // Deep-link support for the dashboard's Quick Actions ("Log Event" / "Request
  // Swap" both land here with ?action=... instead of duplicating forms there).
  const deepLinkAction = searchParams.get("action");
  useEffect(() => {
    if (loading) return;
    const action = deepLinkAction;
    if (action === "add-event") {
      setShowAddEvent(true);
    } else if (action === "swap") {
      swapCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (action) {
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, deepLinkAction]);

  const parents = family.filter((m) => m.role === "PARENT");
  const parentColor = (userId: string | null) => {
    if (!userId) return null;
    const idx = parents.findIndex((p) => p.userId === userId);
    return idx === 0 ? "primary" : idx === 1 ? "secondary" : null;
  };

  const selectedDayEvents = (range?.events ?? []).filter(
    (e) => toDateOnly(new Date(e.startsAt)) === selectedDate
  );
  const selectedOwner = range?.custodyByDate[selectedDate] ?? null;
  const selectedOwnerName = parents.find((p) => p.userId === selectedOwner)?.firstName;

  async function handleAddEvent() {
    if (!childId || !eventTitle.trim()) return;
    setSavingEvent(true);
    try {
      const startsAt = new Date(`${selectedDate}T${eventTime}:00`).toISOString();
      await apiPost(`/children/${childId}/calendar-events`, {
        category: "APPOINTMENT",
        title: eventTitle,
        startsAt,
        isMedical: eventIsMedical,
      } satisfies CreateCalendarEventRequest);
      setEventTitle("");
      setEventIsMedical(false);
      setShowAddEvent(false);
      await loadRange();
    } catch {
      setError("Couldn't add that event — try again.");
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleResolveSwapRequest(id: string, status: ResolveSwapRequestRequest["status"]) {
    if (!childId) return;
    setResolvingSwapId(id);
    try {
      await apiPatch(`/children/${childId}/swap-requests/${id}`, {
        status,
      } satisfies ResolveSwapRequestRequest);
      await loadRange();
    } catch {
      setError("Couldn't update that swap request — try again.");
    } finally {
      setResolvingSwapId(null);
    }
  }

  if (children.length === 0) {
    return (
      <section className="px-container-padding pt-6 flex flex-col gap-2">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
          Calendar
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Add a child first to start planning the schedule.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col w-full min-w-0 bg-surface">
      <div className="px-container-padding py-base flex items-center justify-between sticky top-0 z-20 bg-surface/90 backdrop-blur-md">
        <button
          onClick={() => setSelectedDate(toDateOnly(new Date(new Date(selectedDate).getTime() - 7 * 86400000)))}
          aria-label="Previous week"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant active:scale-95 transition-transform"
        >
          <Icon name="chevron_left" className="text-[20px]" />
        </button>
        <div className="flex flex-col items-center">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            {new Date(selectedDate).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h2>
          {children.length > 1 && (
            <select
              value={childId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="font-label-sm text-label-sm text-on-surface-variant bg-transparent mt-0.5"
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName}'s Schedule
                </option>
              ))}
            </select>
          )}
          {children.length === 1 && (
            <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">
              {children[0].firstName}'s Schedule
            </p>
          )}
        </div>
        <button
          onClick={() => setSelectedDate(toDateOnly(new Date(new Date(selectedDate).getTime() + 7 * 86400000)))}
          aria-label="Next week"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant active:scale-95 transition-transform"
        >
          <Icon name="chevron_right" className="text-[20px]" />
        </button>
      </div>

      <div className="px-container-padding py-4 flex gap-4 overflow-x-auto">
        {parents[0] && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-3 h-3 rounded-full bg-primary-container" />
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {parents[0].firstName}'s Time
            </span>
          </div>
        )}
        {parents[1] && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-3 h-3 rounded-full bg-secondary-fixed-dim" />
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {parents[1].firstName}'s Time
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-3 h-3 rounded-full bg-tertiary-fixed" />
          <span className="font-label-sm text-label-sm text-on-surface-variant">Appointment</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-3 h-3 rounded-full bg-journal-peach" />
          <span className="font-label-sm text-label-sm text-on-surface-variant">Holiday</span>
        </div>
      </div>

      {loading ? (
        <p className="px-container-padding font-body-md text-body-md text-on-surface-variant">
          Loading…
        </p>
      ) : (
        <>
          <div className="px-container-padding pb-6 pt-2">
            <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory">
              {weekDays.map((day, i) => {
                const iso = toDateOnly(day);
                const isSelected = iso === selectedDate;
                const owner = range?.custodyByDate[iso] ?? null;
                const color = parentColor(owner);
                const dayEvents = (range?.events ?? []).filter(
                  (e) => toDateOnly(new Date(e.startsAt)) === iso
                );
                return (
                  <button
                    key={iso}
                    onClick={() => setSelectedDate(iso)}
                    className={`shrink-0 snap-center w-14 h-20 rounded-[20px] flex flex-col items-center justify-center gap-1 transition-all ${
                      isSelected
                        ? "bg-primary-container shadow-sm scale-110 mx-1"
                        : "bg-surface-container-low"
                    }`}
                  >
                    <span
                      className={`font-label-sm text-label-sm ${
                        isSelected ? "text-on-primary-container" : "text-on-surface-variant"
                      }`}
                    >
                      {DAY_LABELS[i]}
                    </span>
                    <span
                      className={`font-headline-lg-mobile text-headline-lg-mobile ${
                        isSelected ? "text-on-primary-container" : "text-on-surface"
                      }`}
                    >
                      {day.getUTCDate()}
                    </span>
                    <div className="flex gap-1 mt-1">
                      {color && (
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected
                              ? "bg-surface"
                              : color === "primary"
                                ? "bg-primary-container"
                                : "bg-secondary-fixed-dim"
                          }`}
                        />
                      )}
                      {dayEvents.length > 0 && (
                        <div className="w-1.5 h-1.5 rounded-full bg-tertiary-fixed" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-container-padding flex-1 flex flex-col gap-6">
            {/* Custody schedule setup/editing now lives on the child's
                profile page, alongside their other settings — this is just
                a pointer there for anyone who hasn't set one up yet. Once a
                plan exists, the day strip's colored dots and the "X's Time"
                label below already show it, so nothing more is needed here. */}
            {hasPlan === false && childId && (
              <div className="bg-surface-container rounded-2xl p-4 flex items-center justify-between gap-3">
                <p className="font-body-md text-body-md text-on-surface-variant">
                  No custody schedule set yet.
                </p>
                <Link
                  to={`/children/${childId}`}
                  className="shrink-0 py-2 px-4 rounded-full bg-surface-container-lowest text-primary font-label-sm text-label-sm"
                >
                  Set one up
                </Link>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-headline-md text-on-surface">
                {new Date(selectedDate).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </h3>
              {selectedOwnerName && (
                <span className="font-label-sm text-label-sm text-primary bg-primary-fixed/30 px-3 py-1 rounded-full">
                  {selectedOwnerName}'s Time
                </span>
              )}
            </div>

            {error && (
              <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-4 relative">
              {selectedDayEvents.length === 0 && (
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Nothing scheduled for this day.
                </p>
              )}
              {selectedDayEvents.map((event) => (
                <div
                  key={event.id}
                  className="relative z-10 bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-surface-variant/50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      {!event.allDay && (
                        <span className="font-label-sm text-label-sm text-on-surface-variant block mb-1">
                          {new Date(event.startsAt).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                      <h4 className="font-label-md text-label-md text-on-surface">{event.title}</h4>
                    </div>
                    <div className="bg-surface-container px-2 py-1 rounded-lg">
                      <Icon name={CATEGORY_ICON[event.category]} className="text-[18px] text-primary" />
                    </div>
                  </div>
                  {event.notes && (
                    <p className="font-body-md text-[14px] text-on-surface-variant">{event.notes}</p>
                  )}
                </div>
              ))}
            </div>

            {!showAddEvent ? (
              <button
                onClick={() => setShowAddEvent(true)}
                className="w-full py-3 rounded-xl bg-surface-container text-primary font-label-md text-label-md flex items-center justify-center gap-2"
              >
                <Icon name="add" />
                Add appointment
              </button>
            ) : (
              <div className="bg-surface-container rounded-2xl p-4 flex flex-col gap-3">
                <input
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="e.g. Dentist appointment"
                  className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
                />
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
                />
                <label className="flex items-center gap-2 px-1 font-body-md text-body-md text-on-surface-variant">
                  <input
                    type="checkbox"
                    checked={eventIsMedical}
                    onChange={(e) => setEventIsMedical(e.target.checked)}
                    className="w-5 h-5 rounded accent-primary"
                  />
                  Medical appointment (shows on Health page)
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowAddEvent(false);
                      setEventIsMedical(false);
                    }}
                    className="flex-1 py-3 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-md text-label-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddEvent}
                    disabled={savingEvent || !eventTitle.trim()}
                    className="flex-1 py-3 rounded-full bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60"
                  >
                    {savingEvent ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}

            {user && childId && (
              <div ref={swapCardRef}>
                <SwapRequestCard childId={childId} selectedDate={selectedDate} onSent={loadRange} />
              </div>
            )}

            {swapRequests.some((r) => r.status === "PENDING") && (
              <div className="flex flex-col gap-3 mb-8">
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  Pending swap requests
                </h3>
                {swapRequests
                  .filter((r) => r.status === "PENDING")
                  .map((req) => {
                    const requester = family.find((m) => m.userId === req.requestedById);
                    const requesterName =
                      requester?.userId === user?.id ? "You" : requester?.firstName ?? "Someone";
                    const isOwnRequest = req.requestedById === user?.id;
                    return (
                      <div
                        key={req.id}
                        className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-surface-variant/50 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-label-md text-label-md text-on-surface">
                            {requesterName} requested a swap
                          </span>
                          <span className="font-label-sm text-label-sm text-on-surface-variant">
                            {new Date(req.date).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        {req.message && (
                          <p className="font-body-md text-[14px] text-on-surface-variant">
                            {req.message}
                          </p>
                        )}
                        {!isOwnRequest ? (
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={() => handleResolveSwapRequest(req.id, "DECLINED")}
                              disabled={resolvingSwapId === req.id}
                              className="flex-1 py-2 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md disabled:opacity-60"
                            >
                              Decline
                            </button>
                            <button
                              onClick={() => handleResolveSwapRequest(req.id, "APPROVED")}
                              disabled={resolvingSwapId === req.id}
                              className="flex-1 py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60"
                            >
                              {resolvingSwapId === req.id ? "Saving…" : "Approve"}
                            </button>
                          </div>
                        ) : (
                          <span className="font-label-sm text-label-sm text-on-surface-variant">
                            Waiting for the other parent to respond
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
