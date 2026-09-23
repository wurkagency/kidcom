import { addDays, isoWeek, monthGrid, monthOf, useFormat, useT, weekDays, type DateKey } from "@kidcom/core";

import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";

// The week strip (kidcom_calendar_2, and on peach in kidcom_calendar_3) and
// the month grid (kidcom_calendar_1). The shaded band is the selected day's
// custody block; dots mark days with appointments or due tasks.

export type DayMarks = Record<DateKey, { rose: boolean }[]>;

type Props = {
  mode: "week" | "month";
  /** Week strip drawn on peach with the month as its title (Agenda). */
  agenda?: boolean;
  selected: DateKey;
  today: DateKey;
  /** date → custody holder for the band (first selected child) */
  custody: Record<string, string | null> | undefined;
  marks: DayMarks;
  onSelect: (day: DateKey) => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleMode: () => void;
};

const MAX_DOTS = 2;

export function DateStrip({ mode, agenda, selected, today, custody, marks, onSelect, onPrev, onNext, onToggleMode }: Props) {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const days = mode === "month" ? monthGrid(selected, fmt.weekStart) : weekDays(selected, fmt.weekStart);
  const month = monthOf(selected);
  const holder = custody?.[selected] ?? null;
  const inBand = (day: DateKey) => holder !== null && custody?.[day] === holder;

  const title =
    mode === "month" || agenda ? fmt.monthYear(`${selected}T12:00:00Z`) : t("strip.week", { week: isoWeek(selected) });
  const headers = weekDays(selected, fmt.weekStart).map((d) => fmt.date(`${d}T12:00:00Z`, { weekday: "short" }).slice(0, 2));

  return (
    <section
      className={cn(
        "p-space-lg rounded-[28px] flex flex-col gap-space-md",
        agenda ? "bg-peach shadow-[0_6px_20px_rgba(0,0,0,0.04)]" : "bg-surface-container-lowest shadow-[0_4px_16px_-4px_rgba(0,0,0,0.03)]",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-title-md text-title-md text-on-surface font-semibold">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t(mode === "month" ? "strip.prevMonth" : "strip.prevWeek")}
            onClick={onPrev}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors text-secondary"
          >
            <Icon name="chevron_left" className="text-[18px]" />
          </button>
          <button
            type="button"
            aria-label={t(mode === "month" ? "strip.nextMonth" : "strip.nextWeek")}
            onClick={onNext}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors text-secondary"
          >
            <Icon name="chevron_right" className="text-[18px]" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center font-micro-meta text-micro-meta text-secondary uppercase font-semibold py-1">
        {headers.map((h, i) => (
          <span key={i}>{h}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-label-sm font-label-sm">
        {days.map((day, i) => {
          const band = inBand(day);
          const isSelected = day === selected;
          const dots = marks[day] ?? [];
          const outside = mode === "month" && monthOf(day) !== month;
          const label = fmt.weekdayDate(`${day}T12:00:00Z`);
          const dayNumber = Number(day.slice(8));

          // Month grid: plain numbers except the band, the selection and marked days.
          if (mode === "month" && !band && !isSelected && dots.length === 0) {
            return (
              <button
                key={day}
                type="button"
                aria-label={label}
                onClick={() => onSelect(day)}
                className={cn("p-1", outside ? "text-outline-variant" : "text-on-surface", day === today && "font-bold")}
              >
                {dayNumber}
              </button>
            );
          }

          const col = i % 7;
          const bandStart = band && (col === 0 || !inBand(addDays(day, -1)));
          const bandEnd = band && (col === 6 || !inBand(addDays(day, 1)));
          return (
            <button
              key={day}
              type="button"
              aria-label={label}
              aria-pressed={isSelected}
              onClick={() => onSelect(day)}
              className={cn(
                "relative flex flex-col items-center justify-center py-1.5",
                band && "bg-secondary-container/50",
                bandStart && "rounded-l-full",
                bandEnd && "rounded-r-full",
                outside ? "text-outline-variant" : "text-on-surface",
                isSelected ? "font-semibold" : "font-medium",
              )}
            >
              <span
                className={cn(
                  "w-7 h-7 flex items-center justify-center",
                  isSelected && "rounded-full bg-primary text-on-primary",
                  !isSelected && day === today && "rounded-full ring-1 ring-primary",
                )}
              >
                {dayNumber}
              </span>
              <span className="flex items-center gap-0.5 mt-0.5 h-1">
                {dots.slice(0, MAX_DOTS).map((d, j) => (
                  <span key={j} className={cn("w-1 h-1 rounded-full", d.rose ? "bg-error" : "bg-secondary")} />
                ))}
                {dots.length > MAX_DOTS && <span className="text-[8px] leading-none text-secondary">{t("strip.more", { count: dots.length - MAX_DOTS })}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {mode === "month" ? (
        <button
          type="button"
          onClick={onToggleMode}
          className="w-full flex items-center justify-center gap-1.5 pt-3 pb-1 text-xs font-medium cursor-pointer transition-colors text-sage"
        >
          <Icon name="keyboard_arrow_up" className="text-[16px]" />
          <span>{t("strip.showWeekly")}</span>
        </button>
      ) : (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onToggleMode}
            className="inline-flex items-center gap-1 text-label-sm font-semibold transition-colors hover:opacity-80 active:scale-95 text-sage-ink"
          >
            <Icon name="expand_more" className="text-[16px]" />
            <span>{t("strip.showMonth")}</span>
          </button>
        </div>
      )}
    </section>
  );
}
