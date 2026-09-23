import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type {
  CalendarEventRequestDto,
  CalendarRangeResponse,
  ChildFamilyMember,
  CustodyPlanDto,
  CustodyPlanStatusResponse,
  ResolveCalendarEventRequestRequest,
  ResolveSwapRequestRequest,
  SwapRequestDto,
  ToggleChecklistItemRequest,
  ToggleConfirmationRequest,
} from "@kidcom/shared";
import type { CalendarEventCategory } from "@kidcom/shared";

import { Banner } from "../../components/Banner";
import { CalendarEventRequestCard } from "../../components/CalendarEventRequestCard";
import { SwapRequestCard } from "../../components/SwapRequestCard";
import { apiGet, apiPatch, ApiRequestError } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { getCalendarDefaultView, getWeekStart } from "../../lib/preferences";
import { addDays, startOfWeek, toDateOnly, toLocalDateOnly } from "../../lib/calendarDates";
import { CALENDAR_ALWAYS_VISIBLE_CATEGORIES, CALENDAR_FILTERABLE_CATEGORIES } from "../../lib/calendarCategories";
import { mergeCalendarRanges, type CalendarEventWithChild } from "../../lib/mergeCalendarRanges";

import type { ChildSelection } from "./ChildSelector";
import type { CalendarViewMode } from "./ViewTabs";
import { CalendarActionButtons } from "./CalendarActionButtons";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { ListView } from "./ListView";
import { SchoolView } from "./SchoolView";

// Shared header controls every view renders identically at its top —
// child selector, view tabs, range nav, category filter — kept here so
// CalendarShell only has to define each callback once.
export type CalendarViewHeaderProps = {
  childrenList: ReturnType<typeof useAuth>["children"];
  selectedChild: ChildSelection;
  onSelectChild: (selection: ChildSelection) => void;
  view: CalendarViewMode;
  onChangeView: (view: CalendarViewMode) => void;
  categoryFilter: Set<CalendarEventCategory>;
  onToggleCategory: (category: CalendarEventCategory) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
};

// Replaces the old single-view CalendarPage.tsx body. Owns child selection
// (incl. "Both"), the ?view= url param, category filter state, and the data
// load that feeds whichever of Month/Week/List is active — all three share
// one load so switching tabs doesn't re-fetch. Each view renders its own
// full header (matching its own mockup exactly) via CalendarViewHeaderProps
// rather than Shell rendering one generic shared header.
export function CalendarShell() {
  const { user, children } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const swapCardRef = useRef<HTMLDivElement>(null);

  const [selectedChild, setSelectedChild] = useState<ChildSelection>(children[0]?.id ?? "both");
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateOnly(new Date()));
  const [family, setFamily] = useState<ChildFamilyMember[]>([]);
  const [ranges, setRanges] = useState<{ childId: string; range: CalendarRangeResponse }[]>([]);
  const [custodyPlan, setCustodyPlan] = useState<CustodyPlanDto | null>(null);
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);
  const [daysUntilLocked, setDaysUntilLocked] = useState<number | null>(null);
  const [swapRequests, setSwapRequests] = useState<SwapRequestDto[]>([]);
  const [calendarEventRequests, setCalendarEventRequests] = useState<CalendarEventRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingSwapId, setResolvingSwapId] = useState<string | null>(null);
  const [resolvingEventRequestId, setResolvingEventRequestId] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(new Date());
  const [categoryFilter, setCategoryFilter] = useState<Set<CalendarEventCategory>>(
    () => new Set(CALENDAR_FILTERABLE_CATEGORIES)
  );

  const view = (searchParams.get("view") as CalendarViewMode | null) ?? getCalendarDefaultView();
  const weekStartPref = useMemo(() => getWeekStart(), []);

  function setView(next: CalendarViewMode) {
    searchParams.set("view", next);
    setSearchParams(searchParams, { replace: true });
  }

  const activeChildIds = selectedChild === "both" ? children.map((c) => c.id) : [selectedChild].filter(Boolean) as string[];
  const primaryChildId = selectedChild === "both" ? children[0]?.id : selectedChild;

  // Query range depends on the active view: Week needs just that week; Month
  // and List both work off the full visible month (List shows every event
  // in the selected month, grouped by date).
  const { rangeStartIso, rangeEndIso } = useMemo(() => {
    const anchor = new Date(selectedDate);
    if (view === "week" || view === "school") {
      const weekStartDate = startOfWeek(anchor, weekStartPref);
      return { rangeStartIso: toDateOnly(weekStartDate), rangeEndIso: toDateOnly(addDays(weekStartDate, 6)) };
    }
    const monthStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
    if (view === "month") {
      // Pad to the full 6-week grid so leading/trailing days from adjacent
      // months still show their events/custody tint.
      const gridStart = startOfWeek(monthStart, weekStartPref);
      return { rangeStartIso: toDateOnly(gridStart), rangeEndIso: toDateOnly(addDays(gridStart, 41)) };
    }
    // List view — starts from selectedDate, not the 1st of the month:
    // selectedDate defaults to today and is exactly what clicking a date in
    // Week/Month view sets, so this makes List "start from today" on first
    // load and "start from that day and ahead" after clicking a date
    // elsewhere, while Prev/Next (which set selectedDate to the 1st of the
    // stepped-to month — see goPrev/goNext below) still shows a past/future
    // month in full. selectedDate is always within [monthStart, monthEnd]
    // here since monthStart/monthEnd are derived from it, so this can't
    // start after monthEnd.
    return { rangeStartIso: selectedDate, rangeEndIso: toDateOnly(monthEnd) };
  }, [selectedDate, view, weekStartPref]);

  async function loadRange() {
    if (activeChildIds.length === 0) return;
    const [rangeResults, familyRes, swapRequestsRes, eventRequestsRes, planRes] = await Promise.all([
      Promise.all(
        activeChildIds.map(async (childId) => ({
          childId,
          range: await apiGet<CalendarRangeResponse>(
            `/children/${childId}/calendar?start=${rangeStartIso}&end=${rangeEndIso}`
          ),
        }))
      ),
      primaryChildId ? apiGet<{ members: ChildFamilyMember[] }>(`/children/${primaryChildId}/family`) : Promise.resolve({ members: [] }),
      primaryChildId ? apiGet<{ items: SwapRequestDto[] }>(`/children/${primaryChildId}/swap-requests`) : Promise.resolve({ items: [] }),
      primaryChildId
        ? apiGet<{ items: CalendarEventRequestDto[] }>(`/children/${primaryChildId}/calendar-event-requests`)
        : Promise.resolve({ items: [] }),
      primaryChildId
        ? apiGet<CustodyPlanStatusResponse>(`/children/${primaryChildId}/custody-plan`)
        : Promise.resolve({ plan: null, locked: false, daysUntilLocked: null }),
    ]);
    setRanges(rangeResults);
    setFamily(familyRes.members);
    setSwapRequests(swapRequestsRes.items);
    setCalendarEventRequests(eventRequestsRes.items);
    setHasPlan(planRes.plan !== null);
    setCustodyPlan(planRes.plan);
    setDaysUntilLocked(planRes.daysUntilLocked);
    setLastUpdatedAt(new Date());
  }

  useEffect(() => {
    if (activeChildIds.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRange()
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : "Couldn't load the calendar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChild, rangeStartIso, rangeEndIso]);

  // Deep-link support for the dashboard's Quick Actions — verbatim from the
  // old CalendarPage.tsx, must keep working unchanged.
  const deepLinkAction = searchParams.get("action");
  useEffect(() => {
    if (loading) return;
    const action = deepLinkAction;
    if (action === "add-event" && primaryChildId) {
      navigate(`/children/${primaryChildId}/calendar-events/new`);
      return;
    } else if (action === "swap") {
      swapCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (action) {
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, deepLinkAction, primaryChildId]);

  const merged = useMemo(() => mergeCalendarRanges(ranges), [ranges]);
  const filteredEvents = useMemo(
    () =>
      merged.events.filter(
        (e) => categoryFilter.has(e.category) || (CALENDAR_ALWAYS_VISIBLE_CATEGORIES as CalendarEventCategory[]).includes(e.category)
      ),
    [merged.events, categoryFilter]
  );

  function toggleCategory(category: CalendarEventCategory) {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function openEvent(event: CalendarEventWithChild) {
    if (!event.editable) return;
    navigate(`/children/${event.childId}/calendar-events/${event.id}`);
  }

  async function toggleChecklistItem(event: CalendarEventWithChild, itemId: string, isChecked: boolean) {
    try {
      await apiPatch(
        `/children/${event.childId}/calendar-events/${event.id}/checklist/${itemId}`,
        { isChecked } satisfies ToggleChecklistItemRequest
      );
      await loadRange();
    } catch {
      setError("Couldn't update that checklist item — try again.");
    }
  }

  async function toggleConfirm(event: CalendarEventWithChild, confirmed: boolean) {
    try {
      await apiPatch(
        `/children/${event.childId}/calendar-events/${event.id}/confirm`,
        { confirmed } satisfies ToggleConfirmationRequest
      );
      await loadRange();
    } catch {
      setError("Couldn't update your confirmation — try again.");
    }
  }

  async function handleResolveSwapRequest(id: string, status: ResolveSwapRequestRequest["status"]) {
    if (!primaryChildId) return;
    setResolvingSwapId(id);
    try {
      await apiPatch(`/children/${primaryChildId}/swap-requests/${id}`, { status } satisfies ResolveSwapRequestRequest);
      await loadRange();
    } catch {
      setError("Couldn't update that swap request — try again.");
    } finally {
      setResolvingSwapId(null);
    }
  }

  async function handleResolveCalendarEventRequest(id: string, status: ResolveCalendarEventRequestRequest["status"]) {
    if (!primaryChildId) return;
    setResolvingEventRequestId(id);
    try {
      await apiPatch(
        `/children/${primaryChildId}/calendar-event-requests/${id}`,
        { status } satisfies ResolveCalendarEventRequestRequest
      );
      await loadRange();
    } catch {
      setError("Couldn't update that request — try again.");
    } finally {
      setResolvingEventRequestId(null);
    }
  }

  if (children.length === 0) {
    return (
      <section className="px-container-padding pt-6 flex flex-col gap-2">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Calendar</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Add a child first to start planning the schedule.
        </p>
      </section>
    );
  }

  const isBothMode = selectedChild === "both";
  const myRole = family.find((m) => m.userId === user?.id)?.role;

  // Prev/Next/Today step by a week in Week view, by a month everywhere else
  // (Month's own grid, and List's month-scoped range).
  function stepDate(days: number) {
    setSelectedDate(toDateOnly(new Date(new Date(selectedDate).getTime() + days * 86400000)));
  }
  function goPrev() {
    if (view === "week" || view === "school") return stepDate(-7);
    const d = new Date(selectedDate);
    setSelectedDate(toDateOnly(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))));
  }
  function goNext() {
    if (view === "week" || view === "school") return stepDate(7);
    const d = new Date(selectedDate);
    setSelectedDate(toDateOnly(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))));
  }
  function goToday() {
    setSelectedDate(toLocalDateOnly(new Date()));
  }

  const headerProps: CalendarViewHeaderProps = {
    childrenList: children,
    selectedChild,
    onSelectChild: setSelectedChild,
    view,
    onChangeView: setView,
    categoryFilter,
    onToggleCategory: toggleCategory,
    onPrev: goPrev,
    onNext: goNext,
    onToday: goToday,
  };

  return (
    <div className="flex flex-col w-full min-w-0 bg-surface px-container-padding gap-element-gap pt-2 pb-6">
      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}

      {hasPlan === false && primaryChildId && !isBothMode && (
        <div className="bg-surface-container rounded-2xl p-4 flex items-center justify-between gap-3">
          <p className="font-body-md text-body-md text-on-surface-variant">No custody schedule set yet.</p>
          <a
            href={`/children/${primaryChildId}`}
            className="shrink-0 py-2 px-4 rounded-full bg-surface-container-lowest text-primary font-label-sm text-label-sm"
          >
            Set one up
          </a>
        </div>
      )}

      {/* spec 9.8's persistent banner, post-launch backlog Phase D — shown
          only to a PARENT (the only role that could actually act on it by
          inviting another parent). Informative, not alarmist: custody
          *scheduling* between two homes genuinely needs both, but the
          mechanism can't tell "co-parent hasn't joined yet" apart from "this
          is a deliberately single-parent household" — the copy doesn't
          presume anything is wrong. */}
      {daysUntilLocked !== null && primaryChildId && !isBothMode && myRole === "PARENT" && (
        <Banner icon="family_restroom" action={{ label: "Invite a co-parent", onClick: () => navigate(`/onboarding/invite?childId=${primaryChildId}`) }}>
          Custody scheduling works best with both parents on KidCom, since it splits time between two homes.
          Invite your co-parent whenever you're ready.
        </Banner>
      )}

      {loading ? (
        <p className="py-6 font-body-md text-body-md text-on-surface-variant">Loading…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Aura's mockups (kidcom_calendar_1..3) show the pending swap card
              right under the header's filter row, not buried at the bottom
              of the page — moved up here (still real, existing data/handlers,
              just reordered) so it's seen before someone scrolls the whole
              schedule. */}
          {swapRequests.some((r) => r.status === "PENDING") && (
            <div className="flex flex-col gap-3">
              <h3 className="font-headline-md text-headline-md text-on-surface">Pending swap requests</h3>
              {swapRequests
                .filter((r) => r.status === "PENDING")
                .map((req) => {
                  const requester = family.find((m) => m.userId === req.requestedById);
                  const requesterName = requester?.userId === user?.id ? "You" : requester?.firstName ?? "Someone";
                  const isOwnRequest = req.requestedById === user?.id;
                  return (
                    <div
                      key={req.id}
                      className="bg-secondary-container/40 rounded-2xl p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-label-md text-label-md text-on-surface">
                          {requesterName} requested a swap
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          {new Date(req.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      {req.message && (
                        <p className="font-body-md text-[14px] text-on-surface-variant">{req.message}</p>
                      )}
                      {!isOwnRequest ? (
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => handleResolveSwapRequest(req.id, "DECLINED")}
                            disabled={resolvingSwapId === req.id}
                            className="flex-1 py-2 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-md text-label-md disabled:opacity-60"
                          >
                            Discuss
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

          {calendarEventRequests.some((r) => r.status === "PENDING") && (
            <div className="flex flex-col gap-3">
              <h3 className="font-headline-md text-headline-md text-on-surface">Pending event requests</h3>
              {calendarEventRequests
                .filter((r) => r.status === "PENDING")
                .map((req) => {
                  const requester = family.find((m) => m.userId === req.requestedById);
                  const requesterName = requester?.userId === user?.id ? "You" : requester?.firstName ?? "Someone";
                  const isOwnRequest = req.requestedById === user?.id;
                  return (
                    <div
                      key={req.id}
                      className="bg-secondary-container/40 rounded-2xl p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-label-md text-label-md text-on-surface">
                          {requesterName} requested "{req.title}"
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          {new Date(req.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      {req.message && (
                        <p className="font-body-md text-[14px] text-on-surface-variant">{req.message}</p>
                      )}
                      {!isOwnRequest ? (
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => handleResolveCalendarEventRequest(req.id, "DECLINED")}
                            disabled={resolvingEventRequestId === req.id}
                            className="flex-1 py-2 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-md text-label-md disabled:opacity-60"
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => handleResolveCalendarEventRequest(req.id, "APPROVED")}
                            disabled={resolvingEventRequestId === req.id}
                            className="flex-1 py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60"
                          >
                            {resolvingEventRequestId === req.id ? "Saving…" : "Approve"}
                          </button>
                        </div>
                      ) : (
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          Waiting for a parent or guardian to respond
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* Bug fix — calendar views weren't full width, padding showed on
              both sides beyond what the mockups call for. Each view
              (Month/Week/List) already applies px-container-padding itself,
              per-section, matching its own mockup exactly — but this shell's
              own wrapper (below) also applies px-container-padding to
              everything it contains, so the views were getting that padding
              twice. -mx-container-padding here cancels the shell's padding
              for just this subtree; everything else in the shell (banners,
              action buttons, swap/event-request cards) has no padding of
              its own and still needs the shell's, so it's left alone. */}
          <div className="-mx-container-padding">
            {view === "week" && (
              <WeekView
                header={headerProps}
                anchorDate={selectedDate}
                weekStartPref={weekStartPref}
                events={filteredEvents}
                custodyByDate={merged.custodyByDate}
                family={family}
                currentUserId={user?.id ?? null}
                custodyPlan={custodyPlan}
                isBothMode={isBothMode}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onOpenEvent={openEvent}
                onToggleChecklistItem={toggleChecklistItem}
                onToggleConfirm={toggleConfirm}
              />
            )}
            {view === "month" && (
              <MonthView
                header={headerProps}
                monthAnchorIso={selectedDate}
                weekStartPref={weekStartPref}
                events={filteredEvents}
                custodyByDate={merged.custodyByDate}
                family={family}
                currentUserId={user?.id ?? null}
                selectedDate={selectedDate}
                isBothMode={isBothMode}
                onSelectDate={setSelectedDate}
                onOpenEvent={openEvent}
                onToggleChecklistItem={toggleChecklistItem}
                onToggleConfirm={toggleConfirm}
              />
            )}
            {view === "list" && (
              <ListView
                header={headerProps}
                monthAnchorIso={selectedDate}
                rangeStartIso={rangeStartIso}
                rangeEndIso={rangeEndIso}
                events={filteredEvents}
                custodyByDate={merged.custodyByDate}
                family={family}
                currentUserId={user?.id ?? null}
                isBothMode={isBothMode}
                lastUpdatedAt={lastUpdatedAt}
                onOpenEvent={openEvent}
                onToggleChecklistItem={toggleChecklistItem}
                onToggleConfirm={toggleConfirm}
              />
            )}
            {view === "school" && (
              <SchoolView
                header={headerProps}
                anchorDate={selectedDate}
                weekStartPref={weekStartPref}
                events={merged.events}
                currentUserId={user?.id ?? null}
                onOpenEvent={openEvent}
                onToggleChecklistItem={toggleChecklistItem}
              />
            )}
          </div>

          {primaryChildId && (
            <CalendarActionButtons onAdd={() => navigate(`/children/${primaryChildId}/calendar-events/new`)} />
          )}

          {user && primaryChildId && (
            <div ref={swapCardRef}>
              <SwapRequestCard childId={primaryChildId} selectedDate={selectedDate} onSent={loadRange} />
            </div>
          )}

          {user && primaryChildId && (
            <CalendarEventRequestCard childId={primaryChildId} selectedDate={selectedDate} onSent={loadRange} />
          )}
        </div>
      )}
    </div>
  );
}
