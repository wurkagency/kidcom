import type { SchoolLessonDto } from "@kinnd/shared";
import { dateKey, isoWeekday, Link, paths, useCurrentUser, useT } from "@kinnd/core";

import { Icon } from "../components/Icon";
import { CustodyCard } from "./CustodyCard";
import { EventCard } from "./EventCard";
import { EmptyCard, SectionHeader, SwapCard } from "./Sections";
import { useCalendarData } from "./useCalendarData";

// kinnd_today_screen_updated_note: greeting over the soft gradient, the
// custody card with packing + Request Swap, today's appointments, today's
// school timetable and the "in sync" reassurance line.

// The export's hero wash, verbatim.
const HERO_STYLE = {
  background:
    "radial-gradient(circle at 20% 12%, rgba(247, 236, 213, 0.65) 0%, transparent 45%), radial-gradient(circle at 80% 15%, rgba(188, 201, 197, 0.55) 0%, transparent 50%), radial-gradient(circle at 45% 30%, rgba(201, 234, 220, 0.5) 0%, transparent 45%), radial-gradient(circle at 85% 50%, rgba(216, 229, 224, 0.45) 0%, transparent 45%), linear-gradient(rgba(255, 255, 255, 0.5) 0%, rgba(248, 250, 249, 0.1) 60%, rgb(248, 250, 249) 100%)",
  maskImage: "linear-gradient(rgb(0, 0, 0) 0%, rgb(0, 0, 0) 60%, transparent 95%)",
};

const sageButton =
  "w-full py-3 px-4 rounded-full bg-sage text-obsidian flex items-center justify-center gap-2 font-label-md text-label-md transition-transform active:scale-95 shadow-sm hover:opacity-90 font-semibold mt-3";

export function TodayScreen() {
  const { t } = useT("calendar");
  const me = useCurrentUser();
  const today = dateKey();
  const data = useCalendarData({ from: today, to: today });
  const { kids } = data;
  const events = data.eventsOn(data.today);
  const showNames = kids.length > 1;
  const weekday = isoWeekday(data.today);
  const lessons: SchoolLessonDto[] = data.lessons.filter((l) => l.weekday === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const hasTimetable = data.lessons.length > 0;
  const pendingSwaps = kids.flatMap((c) => c.pendingSwaps.map((s) => ({ swap: s, child: c })));
  const inSync = kids.length > 0 && pendingSwaps.length === 0 && kids.every((c) => c.custody.plan);

  return (
    <>
      <div className="absolute top-0 left-0 right-0 h-[480px] pointer-events-none overflow-hidden select-none z-0" style={HERO_STYLE}>
        <div className="w-full h-full backdrop-blur-[40px]" />
      </div>
      <div className="flex flex-col w-full pb-6 gap-space-lg relative z-10">
        <section className="flex flex-col items-start text-left gap-space-xs relative z-10 pt-6 pb-2">
          <div className="flex flex-col items-start text-left">
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface tracking-tight">
              {t("today.greeting", { name: me.firstName })}
            </h1>
            <span className="text-xs text-on-surface-variant font-bold tracking-wide mt-1">{t("today.subtitle")}</span>
          </div>
        </section>

        {kids.map((c) => (
          <CustodyCard key={c.childId} child={c} variant="today" childName={showNames ? data.childName(c.childId) : undefined} />
        ))}
        {pendingSwaps.map(({ swap, child }) => (
          <SwapCard key={swap.id} swap={swap} childId={child.childId} members={child.members} canApprove={child.can.approveSwap} />
        ))}

        <section className="flex flex-col gap-4 mt-3">
          <SectionHeader title={t("today.title")} count={t("appointments.scheduled", { count: events.length })} semibold={false} />
          <div className="flex flex-col gap-3">
            {events.length === 0 && <EmptyCard icon="event" text={t("today.nothingScheduled")} />}
            {events.map((e) => (
              <EventCard
                key={`${e.id}-${e.startsAt}`}
                event={e}
                category={e.categoryId ? data.categories.get(e.categoryId) : undefined}
                members={data.membersFor(e.childId)}
              />
            ))}
            <Link to={paths.calendar.agenda()} className={sageButton}>
              <Icon name="calendar_today" className="text-[18px]" />
              <span>{t("today.seeCalendar")}</span>
            </Link>
          </div>
        </section>

        {hasTimetable && (
          <section className="flex flex-col gap-space-xs mt-3">
            <div className="flex items-center justify-between px-1">
              <span className="font-title-md text-title-md text-on-surface">{t("school.title")}</span>
            </div>
            <div className="bg-surface-container-lowest rounded-[26px] p-5 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex flex-col gap-4">
              {lessons.length === 0 ? (
                <p className="font-body-md text-body-md text-secondary">{t("school.noLessonsToday")}</p>
              ) : (
                <div className="flex flex-col divide-y divide-outline-variant/20">
                  {lessons.map((l) => (
                    <LessonRow key={l.id} lesson={l} childName={showNames ? data.childName(l.childId) : undefined} />
                  ))}
                </div>
              )}
            </div>
            <Link to={paths.calendar.school()} className={sageButton}>
              <Icon name="schedule" className="text-[18px]" />
              <span>{t("school.seeFull")}</span>
            </Link>
          </section>
        )}

        {inSync && (
          <section className="bg-surface-container rounded-2xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Icon name="favorite" className="text-[18px] text-secondary" />
              <span className="font-label-sm text-label-sm text-secondary">{t("today.inSync")}</span>
            </div>
            <span className="font-micro-meta text-micro-meta uppercase tracking-wider text-secondary">{t("today.verified")}</span>
          </section>
        )}
      </div>
    </>
  );
}

/** One timetable row: "09:00  Math & Logic ……… Room 14" (+ what to bring). */
export function LessonRow({ lesson, childName, className }: { lesson: SchoolLessonDto; childName?: string; className?: string }) {
  const sub = [childName, lesson.bring].filter(Boolean).join(" · ");
  return (
    <div className={className ?? "flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"}>
      <div className={sub ? "flex items-start gap-3 min-w-0" : "flex items-center gap-3 min-w-0"}>
        <span className={sub ? "font-label-md text-label-md text-secondary font-semibold w-12 shrink-0 pt-0.5" : "font-label-md text-label-md text-secondary font-semibold w-12 shrink-0"}>
          {lesson.startTime}
        </span>
        {sub ? (
          <div className="flex flex-col min-w-0">
            <span className="font-label-md text-label-md text-on-surface font-semibold truncate">{lesson.subject}</span>
            <span className="font-label-sm text-label-sm text-secondary truncate mt-0.5">{sub}</span>
          </div>
        ) : (
          <span className="font-label-md text-label-md text-on-surface font-semibold truncate">{lesson.subject}</span>
        )}
      </div>
      {lesson.room && <span className="font-label-sm text-label-sm text-secondary shrink-0 text-right">{lesson.room}</span>}
    </div>
  );
}
