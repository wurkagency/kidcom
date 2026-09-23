import type { CalendarEventDto } from "@kidcom/shared";

// Shared row -> DTO mapping for CalendarEvent, used by the range/overview
// endpoints and single-event CRUD alike, so the copies can't drift.
export const CALENDAR_EVENT_INCLUDE = {
  confirmations: true,
  checklistItems: { orderBy: { sortOrder: "asc" as const } },
} as const;

export type CalendarEventRow = {
  id: string;
  childId: string;
  kind: CalendarEventDto["kind"];
  categoryId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  notes: string | null;
  location: string | null;
  address: string | null;
  assigneeId: string | null;
  assignedNote: string | null;
  contactName: string | null;
  contactDetail: string | null;
  confirmable: boolean;
  confirmations: { userId: string }[];
  checklistItems: { id: string; kind: "TASK" | "PACKING"; label: string; isChecked: boolean; sortOrder: number }[];
  recurrenceIntervalWeeks: number | null;
  recurrenceEndsAt: Date | null;
};

export function toCalendarEventDto(row: CalendarEventRow): CalendarEventDto {
  return {
    id: row.id,
    childId: row.childId,
    kind: row.kind,
    categoryId: row.categoryId,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    allDay: row.allDay,
    notes: row.notes,
    location: row.location,
    address: row.address,
    assigneeUserId: row.assigneeId,
    editable: row.kind !== "NATIONAL_HOLIDAY",
    assignedNote: row.assignedNote,
    contactName: row.contactName,
    contactDetail: row.contactDetail,
    confirmable: row.confirmable,
    confirmedByUserIds: row.confirmations.map((c) => c.userId),
    checklist: row.checklistItems.map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
      isChecked: item.isChecked,
      sortOrder: item.sortOrder,
    })),
    recurrenceIntervalWeeks: row.recurrenceIntervalWeeks,
    recurrenceEndsAt: row.recurrenceEndsAt?.toISOString() ?? null,
  };
}
