import * as React from "react"
import { DayPicker, getDefaultClassNames, type DayButton } from "react-day-picker"

import { useFormat } from "@kidcom/core"

import { cn } from "../lib/utils"
import { Icon } from "../components/Icon"

// shadcn Calendar (react-day-picker), dressed like Aura's month grid
// (kidcom_calendar_1): micro-meta weekday heads, title-md caption, the
// selected day as a 28px obsidian circle, secondary chevron buttons.
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const d = getDefaultClassNames()
  const fmt = useFormat()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={(fmt.weekStart % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6}
      formatters={{
        // The picker's dates are device-local midnights; read them at local noon so the
        // Copenhagen-zoned formatters land on the same calendar day.
        formatCaption: (month) => fmt.monthYear(new Date(month.getFullYear(), month.getMonth(), 15, 12)),
        formatWeekdayName: (day) => fmt.date(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12), { weekday: "short" }).slice(0, 2),
      }}
      className={cn("group/calendar w-full", className)}
      classNames={{
        root: cn("w-full", d.root),
        months: cn("relative flex flex-col gap-4", d.months),
        month: cn("flex w-full flex-col gap-space-md", d.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-end gap-1", d.nav),
        button_previous: cn(
          "w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors text-secondary aria-disabled:opacity-50",
          d.button_previous
        ),
        button_next: cn(
          "w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors text-secondary aria-disabled:opacity-50",
          d.button_next
        ),
        month_caption: cn("flex h-8 w-full items-center", d.month_caption),
        caption_label: cn("font-title-md text-title-md text-on-surface font-semibold select-none", d.caption_label),
        month_grid: cn("w-full border-collapse", d.month_grid),
        weekdays: cn("grid grid-cols-7 gap-1 py-1", d.weekdays),
        weekday: cn(
          "text-center font-micro-meta text-micro-meta text-secondary uppercase font-semibold select-none",
          d.weekday
        ),
        week: cn("grid grid-cols-7 gap-1 mt-1", d.week),
        day: cn("relative flex items-center justify-center p-0 text-center select-none", d.day),
        today: cn("font-bold", d.today),
        outside: cn("text-outline-variant", d.outside),
        disabled: cn("opacity-40", d.disabled),
        hidden: cn("invisible", d.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className, orientation }) => (
          <Icon
            name={orientation === "left" ? "chevron_left" : orientation === "right" ? "chevron_right" : "expand_more"}
            className={cn("text-[18px]", className)}
          />
        ),
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString()}
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center font-label-sm text-label-sm text-on-surface transition-colors hover:bg-surface-container outline-none focus-visible:ring-2 focus-visible:ring-primary",
        modifiers.outside && "text-outline-variant",
        modifiers.today && !modifiers.selected && "ring-1 ring-primary",
        modifiers.selected && "bg-primary text-on-primary hover:bg-primary",
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
