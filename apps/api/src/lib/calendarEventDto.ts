import type { CalendarEventDto } from "@kidcom/shared";

// Shared row -> DTO mapping for CalendarEvent, used by both calendar.ts (the
// combined range endpoint) and calendarEvents.ts (single-event CRUD) — both
// need the same richer shape now (checklist + confirmations + contact/note
// fields), so this factors the mapping out to one place rather than letting
// the two files' copies drift.
export const CALENDAR_EVENT_INCLUDE = {
  confirmations: true,
  checklistItems: { orderBy: { sortOrder: "asc" as const } },
} as const;

export type CalendarEventRow = {
  id: string;
  category: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  notes: string | null;
  location: string | null;
  assignedNote: string | null;
  contactName: string | null;
  contactDetail: string | null;
  confirmable: boolean;
  confirmations: { userId: string }[];
  checklistItems: { id: string; label: string; isChecked: boolean; sortOrder: number }[];
  recurrenceIntervalWeeks: number | null;
  recurrenceEndsAt: Date | null;
};

export function toCalendarEventDto(row: CalendarEventRow): CalendarEventDto {
  return {
    id: row.id,
    category: row.category as CalendarEventDto["category"],
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    allDay: row.allDay,
    notes: row.notes,
    location: row.location,
    editable: row.category !== "HOLIDAY",
    assignedNote: row.assignedNote,
    contactName: row.contactName,
    contactDetail: row.contactDetail,
    confirmable: row.confirmable,
    confirmedByUserIds: row.confirmations.map((c) => c.userId),
    checklist: row.checklistItems.map((item) => ({
      id: item.id,
      label: item.label,
      isChecked: item.isChecked,
      sortOrder: item.sortOrder,
    })),
    recurrenceIntervalWeeks: row.recurrenceIntervalWeeks,
    recurrenceEndsAt: row.recurrenceEndsAt?.toISOString() ?? null,
  };
}
