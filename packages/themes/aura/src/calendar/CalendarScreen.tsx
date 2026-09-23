import type { ReactNode } from "react";
import {
  addDays,
  addMonths,
  CALENDAR_ITEM_TYPES,
  firstOfMonth,
  Link,
  monthGrid,
  dateKey,
  paths,
  useCalendarFilters,
  useCategories,
  useFormat,
  useNavigate,
  useSearchParams,
  useT,
  weekDays,
  type DateKey,
} from "@kidcom/core";

import { Icon } from "../components/Icon";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../lib/utils";
import { CustodyCard } from "./CustodyCard";
import { DateStrip } from "./DateStrip";
import { EventCard } from "./EventCard";
import { useCategoryName } from "./people";
import { EmptyCard, menuContentClass, NotesSection, SchoolReminder, SectionHeader, SwapCard, TasksSection } from "./Sections";
import { useCalendarData } from "./useCalendarData";

// Agenda (kidcom_calendar_3), Week (kidcom_calendar_2) and Month
// (kidcom_calendar_1). The selected day lives in ?date= so switching views
// keeps it.

type View = "agenda" | "week" | "month" | "school";
const VIEW_PATH: Record<View, () => string> = {
  agenda: paths.calendar.agenda,
  week: paths.calendar.week,
  month: paths.calendar.month,
  school: paths.calendar.school,
};

export function useSelectedDay(today: DateKey) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("date");
  const selected = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
  const select = (day: DateKey) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (day === today) next.delete("date");
        else next.set("date", day);
        return next;
      },
      { replace: true },
    );
  return [selected, select] as const;
}

/** Title row: headline + the view dropdown ("Agenda ▾"). */
export function CalendarTitle({ title, view, selected }: { title: ReactNode; view: View; selected: DateKey }) {
  const { t } = useT("calendar");
  const navigate = useNavigate();
  const views: View[] = ["agenda", "week", "month", "school"];
  return (
    <div className="flex flex-col gap-space-xs pt-6">
      <div className="flex items-center justify-between">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{title}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-surface-container text-on-surface border border-outline-variant/30 text-label-sm font-semibold shadow-sm transition-all active:scale-95 bg-surface-container-lowest group">
            <Icon name="tune" className="text-[16px] text-secondary" />
            <span>{t(`views.${view}`)}</span>
            <Icon name="expand_more" className="text-[16px] text-secondary transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className={cn(menuContentClass, "w-48 ring-1 ring-surface-container-lowest")}>
            <DropdownMenuLabel className="px-2.5 py-1.5 text-micro-meta uppercase tracking-wider text-secondary font-semibold">
              {t("views.switch")}
            </DropdownMenuLabel>
            {views.map((v) => (
              <DropdownMenuItem
                key={v}
                role="menuitemradio"
                aria-checked={v === view}
                onSelect={() => navigate(`${VIEW_PATH[v]()}${v === "school" ? "" : `?date=${selected}`}`)}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left text-label-sm text-on-surface transition-colors focus:bg-surface-container-low",
                  v === view ? "font-semibold bg-surface-container-low" : "font-medium",
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon
                    name={v === view ? "radio_button_checked" : "radio_button_unchecked"}
                    className={cn("text-[16px]", v === view ? "text-primary" : "text-secondary")}
                  />
                  {t(`views.${v}`)}
                </span>
                {v === "agenda" && <span className="text-micro-meta text-secondary uppercase font-semibold">{t("views.default")}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

const filterButton =
  "flex-1 h-10 inline-flex items-center justify-between px-3.5 rounded-full bg-surface-container-lowest border border-outline-variant/30 text-label-sm font-semibold text-on-surface shadow-sm hover:bg-surface-container-low transition-all active:scale-95";
const checkItem = "px-2.5 py-1.5 pl-8 rounded-xl text-label-sm font-medium text-on-surface focus:bg-surface-container-low";

function FilterBar({ filters }: { filters: ReturnType<typeof useCalendarFilters> }) {
  const { t } = useT("calendar");
  const { data: categories = [] } = useCategories();
  const categoryName = useCategoryName();
  const { categoryIds, types } = filters.filters;
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <div className="flex items-center gap-2 w-full pb-1 -mt-1">
      <DropdownMenu>
        <DropdownMenuTrigger className={filterButton}>
          <div className="flex items-center gap-1.5 min-w-0">
            <Icon name="tune" className="text-[16px] text-on-surface-variant" />
            <span className="truncate">{t("filters.categories")}</span>
            {categoryIds.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-surface-container-high text-on-surface-variant text-[10px] font-semibold flex items-center justify-center shrink-0">
                {categoryIds.length}
              </span>
            )}
          </div>
          <Icon name="expand_more" className="text-[16px] text-on-surface-variant" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={cn(menuContentClass, "w-56 max-h-80")}>
          {categories
            .filter((c) => !c.archived)
            .map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                className={checkItem}
                checked={categoryIds.includes(c.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => filters.setFilters({ ...filters.filters, categoryIds: toggle(categoryIds, c.id) })}
              >
                <Icon name={c.icon} className="text-[16px] text-secondary" />
                {categoryName(c)}
              </DropdownMenuCheckboxItem>
            ))}
          {categoryIds.length > 0 && (
            <DropdownMenuItem className={cn(checkItem, "text-secondary")} onSelect={() => filters.setFilters({ ...filters.filters, categoryIds: [] })}>
              {t("filters.clear")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className={filterButton}>
          <div className="flex items-center gap-1.5 min-w-0">
            <Icon name="category" className="text-[16px] text-on-surface-variant" />
            <span className="truncate">{t("filters.types")}</span>
            {types.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-surface-container-high text-on-surface-variant text-[10px] font-semibold flex items-center justify-center shrink-0">
                {types.length}
              </span>
            )}
          </div>
          <Icon name="expand_more" className="text-[16px] text-on-surface-variant" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={cn(menuContentClass, "w-52")}>
          {CALENDAR_ITEM_TYPES.map((type) => (
            <DropdownMenuCheckboxItem
              key={type}
              className={checkItem}
              checked={types.includes(type)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => filters.setFilters({ ...filters.filters, types: toggle(types, type) })}
            >
              {t(`filters.type.${type}`)}
            </DropdownMenuCheckboxItem>
          ))}
          {types.length > 0 && (
            <DropdownMenuItem className={cn(checkItem, "text-secondary")} onSelect={() => filters.setFilters({ ...filters.filters, types: [] })}>
              {t("filters.clear")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function CalendarView({ view }: { view: "agenda" | "week" | "month" }) {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const navigate = useNavigate();
  const filters = useCalendarFilters();
  const [selected, select] = useSelectedDay(dateKey());
  const days = view === "month" ? monthGrid(selected) : weekDays(selected);
  const range = { from: days[0]!, to: days[days.length - 1]! };
  const data = useCalendarData(range, filters);
  const { kids, today } = data;

  const dayEvents = data.eventsOn(selected);
  const dayTasks = data.tasksFor(selected);
  const firstCustody = kids[0]?.custody.byDate;
  const swapChild = kids.find((c) => c.can.requestSwap);
  const showNames = kids.length > 1;

  const strip = (
    <DateStrip
      mode={view === "month" ? "month" : "week"}
      agenda={view === "agenda"}
      selected={selected}
      today={today}
      custody={firstCustody}
      marks={data.marks}
      onSelect={select}
      onPrev={() => select(view === "month" ? firstOfMonth(addMonths(selected, -1)) : addDays(selected, -7))}
      onNext={() => select(view === "month" ? firstOfMonth(addMonths(selected, 1)) : addDays(selected, 7))}
      onToggleMode={() => navigate(`${(view === "month" ? paths.calendar.week : paths.calendar.month)()}?date=${selected}`)}
    />
  );
  const swaps = kids.flatMap((c) =>
    c.pendingSwaps.map((s) => <SwapCard key={s.id} swap={s} childId={c.childId} members={c.members} canApprove={c.can.approveSwap} />),
  );

  const title =
    view === "agenda"
      ? selected === today
        ? t("agenda.today")
        : fmt.weekdayDate(`${selected}T12:00:00Z`)
      : t(`views.${view}`);

  return (
    <div className="flex flex-col w-full pb-6 gap-space-lg">
      <CalendarTitle title={title} view={view} selected={selected} />
      {view !== "agenda" && strip}
      <FilterBar filters={filters} />
      {swapChild && (
        <Link
          to={`${paths.swapRequest()}?child=${encodeURIComponent(swapChild.childId)}&date=${selected}`}
          className="w-full py-3 px-4 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center gap-2 font-label-md text-label-md transition-transform active:scale-95 shadow-sm hover:opacity-90"
        >
          <Icon name="swap_horiz" className="text-[18px]" />
          <span>{t("swap.request")}</span>
        </Link>
      )}
      {kids.length > 0 && (
        <section className="flex flex-col gap-space-md">
          {/* The export keeps an empty header row here; its gap is part of the layout. */}
          <div className="flex items-center justify-between" aria-hidden="true" />
          <div className="flex flex-col gap-space-md">
            {kids.map((c) => (
              <CustodyCard key={c.childId} child={c} variant="calendar" childName={showNames ? data.childName(c.childId) : undefined} />
            ))}
          </div>
        </section>
      )}
      {view === "agenda" && strip}
      {swaps}

      <section className="flex flex-col gap-4 mt-3">
        <SectionHeader title={t("appointments.title")} count={t("appointments.scheduled", { count: dayEvents.length })} semibold={false} />
        {dayEvents.length === 0 ? (
          <EmptyCard icon="event" text={t("appointments.empty")} to={paths.events.create()} action={t("appointments.add")} />
        ) : (
          <div className="flex flex-col gap-3">
            {dayEvents.map((e) => (
              <EventCard key={`${e.id}-${e.startsAt}`} event={e} category={e.categoryId ? data.categories.get(e.categoryId) : undefined} members={data.membersFor(e.childId)} />
            ))}
          </div>
        )}
      </section>

      <SchoolReminder lessons={data.lessons} />
      {filters.showsType("tasks") && <TasksSection tasks={dayTasks} categories={data.categories} />}
      {filters.showsType("notes") && <NotesSection today={today} notes={data.notes} categories={data.categories} membersFor={data.membersFor} />}
    </div>
  );
}

export const AgendaScreen = () => <CalendarView view="agenda" />;
export const WeekScreen = () => <CalendarView view="week" />;
export const MonthScreen = () => <CalendarView view="month" />;
