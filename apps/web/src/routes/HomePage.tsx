import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  CalendarRangeResponse,
  ChildFamilyMember,
  CustodyPlanDto,
  JournalPostDto,
  PersonalNoteDto,
  ToggleChecklistItemRequest,
} from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { SwapRequestCard } from "../components/SwapRequestCard";
import { apiGet, apiPatch, ApiRequestError } from "../lib/api";
import { fetchMediaUrl } from "../lib/media";
import { useAuth } from "../lib/AuthContext";

// Local calendar date (not UTC) — a parent west of UTC in the evening (or
// east of UTC very early morning) must see their own "today", not the UTC
// one, when looking up custodyByDate or picking the next appointment.
function toLocalDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function relativeDay(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const CATEGORY_ICON: Record<string, string> = {
  APPOINTMENT: "event",
  HOLIDAY: "celebration",
  PLANNED_HOLIDAY: "flight_takeoff",
};

type Reminder = {
  eventId: string;
  childId: string;
  itemId: string;
  label: string;
  eventTitle: string;
  category: string;
  startsAt: string;
};

type DashboardData = {
  plan: CustodyPlanDto | null;
  todaysOwnerName: string | null;
  nextSwitch: { date: string; ownerName: string | null } | null;
  nextAppointment: { title: string; startsAt: string } | null;
  latestPost: JournalPostDto | null;
  reminders: Reminder[];
  notes: PersonalNoteDto[];
};

// Layout follows docs/Themes/Aura/kidcom_today_screen_updated_note/code.html:
// greeting, a mint custody card with a handover link, Next Appointment/
// Latest Journal cards, Reminders & Tasks, Notes, a Swap Request card, then
// quick actions.
//
// Reminders & Tasks and Notes both looked like they'd need new backend
// features at first read — they don't. "Reminders & Tasks" is every
// unchecked CalendarEventChecklistItem across the next 7 days' events,
// aggregated here rather than left buried per-event (checklist items
// already exist — see EventCard.tsx). "Notes" is deliberately scoped to
// PersonalNote — GET /notes is explicitly documented server-side as "a
// private per-user scratchpad... there's no sharing here" (see
// apps/api/src/routes/notes/index.ts), not the shared, co-parent-attributed
// notes the mockup shows. Surfacing it as "Written by Mom"/"Shared by Dad"
// would misrepresent private data as shared, so this shows only the
// signed-in user's own notes, honestly labeled "Your Notes" instead.
export function HomePage() {
  const { user, children } = useAuth();
  const navigate = useNavigate();
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(children[0]?.id);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [journalMediaUrl, setJournalMediaUrl] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);

  const childId = selectedChildId ?? children[0]?.id;
  const child = children.find((c) => c.id === childId);

  useEffect(() => {
    if (!childId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setJournalMediaUrl(null);

    (async () => {
      const today = new Date();
      const start = toLocalDateOnly(today);
      const end = toLocalDateOnly(new Date(today.getTime() + 14 * 86400000));
      const reminderCutoff = today.getTime() + 7 * 86400000;

      const [planRes, rangeRes, familyRes, journalRes, notesRes] = await Promise.all([
        apiGet<{ plan: CustodyPlanDto | null }>(`/children/${childId}/custody-plan`),
        apiGet<CalendarRangeResponse>(`/children/${childId}/calendar?start=${start}&end=${end}`),
        apiGet<{ members: ChildFamilyMember[] }>(`/children/${childId}/family`),
        apiGet<{ items: JournalPostDto[] }>(`/children/${childId}/journal?limit=1`),
        apiGet<{ items: PersonalNoteDto[] }>("/notes"),
      ]);

      const reminders: Reminder[] = rangeRes.events
        .filter((e) => new Date(e.startsAt).getTime() <= reminderCutoff)
        .flatMap((e) =>
          e.checklist
            .filter((item) => !item.isChecked)
            .map((item) => ({
              eventId: e.id,
              childId: childId!,
              itemId: item.id,
              label: item.label,
              eventTitle: e.title,
              category: e.category,
              startsAt: e.startsAt,
            }))
        )
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

      const todaysOwnerId = rangeRes.custodyByDate[start] ?? null;
      const nameFor = (userId: string | null) => {
        if (!userId) return null;
        const member = familyRes.members.find((m) => m.userId === userId);
        if (!member) return null;
        return member.userId === user?.id ? "You" : member.firstName;
      };
      const todaysOwnerName = nameFor(todaysOwnerId);

      // Next date (within the fetched 14-day window) the custody owner
      // differs from today's — drives the mint card's "Until <date> ->
      // <next parent>" handover line without inventing a time-of-day the
      // API doesn't actually track.
      const sortedDates = Object.keys(rangeRes.custodyByDate).sort();
      let nextSwitch: DashboardData["nextSwitch"] = null;
      for (const d of sortedDates) {
        if (d <= start) continue;
        const owner = rangeRes.custodyByDate[d] ?? null;
        if (owner !== todaysOwnerId) {
          nextSwitch = { date: d, ownerName: nameFor(owner) };
          break;
        }
      }

      const now = Date.now();
      // Widened from the old "APPOINTMENT only" filter now that the old
      // isMedical/isSport booleans have become real categories (MEDICAL,
      // SCHOOL, ACTIVITY) — without this, the card would silently narrow to
      // only plain appointments and stop surfacing e.g. an upcoming doctor
      // visit as "Next Appointment".
      const nextAppointment =
        rangeRes.events
          .filter(
            (e) =>
              ["APPOINTMENT", "MEDICAL", "SCHOOL", "ACTIVITY"].includes(e.category) &&
              new Date(e.startsAt).getTime() >= now
          )
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0] ??
        null;

      const latestPost = journalRes.items[0] ?? null;

      return {
        plan: planRes.plan,
        todaysOwnerName,
        nextSwitch,
        nextAppointment: nextAppointment
          ? { title: nextAppointment.title, startsAt: nextAppointment.startsAt }
          : null,
        latestPost,
        reminders,
        notes: notesRes.items.slice(0, 2),
      } satisfies DashboardData;
    })()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        const media = result.latestPost?.media[0];
        if (media && media.status === "READY") {
          fetchMediaUrl(media.id)
            .then((url) => {
              if (!cancelled) setJournalMediaUrl(url);
            })
            .catch(() => {
              if (!cancelled) setJournalMediaUrl(null);
            });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : "Couldn't load the dashboard");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [childId, user?.id, refreshKey]);

  async function toggleReminder(reminder: Reminder) {
    setTogglingItemId(reminder.itemId);
    try {
      await apiPatch(
        `/children/${reminder.childId}/calendar-events/${reminder.eventId}/checklist/${reminder.itemId}`,
        { isChecked: true } satisfies ToggleChecklistItemRequest
      );
      setData((prev) =>
        prev ? { ...prev, reminders: prev.reminders.filter((r) => r.itemId !== reminder.itemId) } : prev
      );
    } catch {
      setError("Couldn't update that item — try again.");
    } finally {
      setTogglingItemId(null);
    }
  }

  if (children.length === 0) {
    return (
      <section className="px-container-padding pt-6 flex flex-col gap-section-margin">
        <div className="flex flex-col gap-2">
          <h1 className="font-display-lg text-display-lg text-on-surface">
            Hi {user?.firstName ?? ""},
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Welcome to KidCom.
          </p>
        </div>
        <div className="bg-surface-container rounded-lg p-6 flex flex-col gap-3">
          <p className="font-body-md text-body-md text-on-surface-variant">
            You haven't added a child yet.
          </p>
          <Link
            to="/onboarding/child"
            className="self-start bg-primary text-on-primary font-label-md text-label-md py-2 px-5 rounded-full"
          >
            Add a child
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col w-full gap-section-margin">
      <section className="px-container-padding flex flex-col gap-2">
        <h1 className="font-display-lg text-display-lg text-on-surface">
          Hi {user?.firstName ?? ""},
        </h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          {child ? `${child.firstName}'s day looks bright!` : "Welcome to KidCom."}
        </p>
        {children.length > 1 && (
          <select
            value={childId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="self-start font-label-sm text-label-sm text-on-surface-variant bg-transparent mt-1"
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName}
              </option>
            ))}
          </select>
        )}
      </section>

      {error && (
        <p className="mx-container-padding font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {loading ? (
        <p className="px-container-padding font-body-md text-body-md text-on-surface-variant">
          Loading…
        </p>
      ) : (
        <>
          {/* Today's Custody — a mint/sage "handover" card, matching
              docs/Themes/Aura/kidcom_today_screen_updated_note's split
              trajectory card, built from the same custodyByDate/plan data
              the old bento-grid tile used, just laid out as a handover
              rather than a single "With <name>" line. */}
          <section className="px-container-padding">
            <Link
              to="/calendar"
              className="block bg-secondary-container rounded-[28px] p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-secondary-container/70 uppercase tracking-wider">
                    {data?.todaysOwnerName ? `${data.todaysOwnerName}'s` : "Today"}
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-secondary-container">Today</span>
                </div>
                <span className="font-micro-meta text-micro-meta uppercase tracking-wider bg-surface-container-lowest text-on-surface px-3 py-1 rounded-full shadow-sm">
                  {data?.plan?.label ?? "No plan yet"}
                </span>
                <div className="flex flex-col items-end text-right">
                  <span className="font-label-sm text-label-sm text-on-secondary-container/70 uppercase tracking-wider">
                    {data?.nextSwitch?.ownerName ? `${data.nextSwitch.ownerName}'s` : "Next"}
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-secondary-container">
                    {data?.nextSwitch
                      ? new Date(data.nextSwitch.date).toLocaleDateString(undefined, { weekday: "short" })
                      : "—"}
                  </span>
                </div>
              </div>
              <div className="mt-4 bg-surface-container-lowest rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center shrink-0">
                    <Icon name="calendar_month" className="text-on-surface-variant text-base" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-title-md text-title-md text-on-surface">
                      {data?.plan ? data.plan.label : "Set up a custody plan"}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {data?.nextSwitch
                        ? `Until ${new Date(data.nextSwitch.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                        : "No upcoming handover"}
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                  <Icon name="arrow_forward" className="text-sm" />
                </div>
              </div>
            </Link>
          </section>

          <section className="px-container-padding grid grid-cols-2 gap-grid-gutter">
            {/* Next Appointment */}
            <Link
              to="/calendar"
              className="bg-surface-container rounded-[24px] p-5 flex flex-col justify-between min-h-[160px] shadow-sm"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-surface-container-lowest flex items-center justify-center shadow-sm">
                  <Icon
                    name={data?.nextAppointment ? CATEGORY_ICON.APPOINTMENT : "event_busy"}
                    className="text-tertiary text-sm"
                  />
                </div>
              </div>
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant mb-1">
                  Next Appointment
                </p>
                {data?.nextAppointment ? (
                  <>
                    <h3 className="font-headline-md text-headline-md text-on-surface leading-tight mb-2 line-clamp-2">
                      {data.nextAppointment.title}
                    </h3>
                    <div className="inline-flex items-center gap-1 bg-surface-container-high px-2 py-1 rounded-md">
                      <Icon name="schedule" className="text-[14px] text-tertiary" />
                      <span className="font-label-sm text-label-sm text-on-surface">
                        {new Date(data.nextAppointment.startsAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </>
                ) : (
                  <h3 className="font-headline-md text-headline-md text-on-surface leading-tight">
                    Nothing coming up
                  </h3>
                )}
              </div>
            </Link>

            {/* Latest Journal Entry */}
            <Link
              to={
                data?.latestPost
                  ? `/journal/${data.latestPost.id}?childId=${childId}`
                  : "/journal"
              }
              state={data?.latestPost ? { post: data.latestPost } : undefined}
              className="bg-journal-peach rounded-[24px] p-1 flex flex-col min-h-[160px] shadow-sm relative overflow-hidden"
            >
              {journalMediaUrl && (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url('${journalMediaUrl}')` }}
                />
              )}
              {journalMediaUrl && (
                <div className="absolute inset-0 bg-gradient-to-t from-on-surface/80 via-transparent to-transparent" />
              )}
              <div className="relative h-full flex flex-col justify-between p-4 z-10">
                <div className="self-end bg-surface-container-lowest/90 backdrop-blur-md rounded-full px-2 py-1 flex items-center gap-1 shadow-sm">
                  <Icon name="photo_library" className="text-[14px] text-primary" />
                  <span className="font-label-sm text-label-sm text-on-surface text-[10px]">
                    Journal
                  </span>
                </div>
                <div className="mt-auto">
                  {data?.latestPost ? (
                    <>
                      <p className="font-label-sm text-label-sm text-surface-container-lowest mb-1 opacity-90">
                        {relativeDay(data.latestPost.createdAt)}
                      </p>
                      <p className="font-body-md text-body-md text-surface-container-lowest line-clamp-2 leading-snug">
                        {data.latestPost.text || data.latestPost.title}
                      </p>
                    </>
                  ) : (
                    <p className="font-body-md text-body-md text-surface-container-lowest leading-snug">
                      No journal entries yet — share the first one.
                    </p>
                  )}
                </div>
              </div>
            </Link>
          </section>

          {data && data.reminders.length > 0 && (
            <section className="px-container-padding flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-md text-headline-md text-on-surface">Reminders & Tasks</h2>
                <span className="font-micro-meta text-micro-meta uppercase tracking-wider bg-surface-container text-on-surface-variant px-2.5 py-1 rounded-full">
                  {data.reminders.length} remaining
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {data.reminders.map((reminder) => (
                  <div
                    key={reminder.itemId}
                    className="flex items-center gap-3 bg-surface-container-lowest rounded-2xl p-3.5 shadow-sm"
                  >
                    <button
                      onClick={() => toggleReminder(reminder)}
                      disabled={togglingItemId === reminder.itemId}
                      aria-label="Mark done"
                      className="shrink-0"
                    >
                      <Icon
                        name={togglingItemId === reminder.itemId ? "progress_activity" : "radio_button_unchecked"}
                        className={`text-on-surface-variant ${togglingItemId === reminder.itemId ? "animate-spin" : ""}`}
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-body-md text-body-md text-on-surface truncate">{reminder.label}</p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant truncate">{reminder.eventTitle}</p>
                    </div>
                    {reminder.category === "MEDICAL" && (
                      <span className="shrink-0 font-micro-meta text-micro-meta uppercase tracking-wider bg-error-container text-on-error-container px-2 py-1 rounded-full">
                        Health
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {data && data.notes.length > 0 && (
            <section className="px-container-padding flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-md text-headline-md text-on-surface">Your Notes</h2>
                <Link to="/messages?tab=notes" className="font-label-sm text-label-sm text-on-surface-variant underline underline-offset-4">
                  See all
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                {data.notes.map((note) => (
                  <div key={note.id} className="bg-secondary-container/40 rounded-2xl p-3.5 shadow-sm">
                    <p className="font-body-md text-body-md text-on-surface line-clamp-2">{note.text}</p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
                      {new Date(note.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {childId && (
            <section className="px-container-padding">
              <SwapRequestCard
                childId={childId}
                selectedDate={toLocalDateOnly(new Date())}
                onSent={() => setRefreshKey((k) => k + 1)}
              />
            </section>
          )}

          <section className="px-container-padding flex flex-col gap-3">
            <button
              onClick={() => navigate("/calendar?action=swap")}
              className="w-full flex items-center justify-center gap-2 h-12 bg-primary text-on-primary rounded-full font-title-md text-title-md active:scale-[0.99] transition-transform"
            >
              <Icon name="swap_horiz" className="text-lg" />
              Request Swap
            </button>
            <button
              onClick={() => navigate("/calendar?action=add-event")}
              className="w-full flex items-center justify-center gap-2 h-11 bg-surface-container-lowest text-on-surface rounded-full font-label-md text-label-md shadow-sm border border-outline-variant/30 active:scale-[0.99] transition-transform"
            >
              <Icon name="add_circle" />
              Log Event
            </button>
          </section>
        </>
      )}
    </div>
  );
}
