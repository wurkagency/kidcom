import {
  SYSTEM_CATEGORIES,
  systemCategoryId,
  type CalendarEventDto,
  type CategoryDto,
  type ChildFamilyMember,
  type ChildOverview,
  type OverviewResponse,
  type SwapRequestDto,
} from "@kidcom/shared";

// The Today / calendar sample content from kidcom_today_screen_updated_note
// and kidcom_calendar_1-3, as API responses. "Today" is Monday 12 October
// 2026: its month grid starts on Sep 28 exactly like the export's.

export const FIXTURE_TODAY = "2026-10-12";
/** 09:00 Copenhagen (UTC+2 in October) on FIXTURE_TODAY */
export const FIXTURE_NOW = new Date("2026-10-12T07:00:00Z");

const member = (userId: string, firstName: string, relationship: ChildFamilyMember["relationship"]): ChildFamilyMember => ({
  userId,
  firstName,
  lastName: "Nielsen",
  avatarUrl: null,
  role: relationship === "FATHER" || relationship === "MOTHER" ? "PARENT" : "FAMILY",
  relationship,
  isMinorMember: false,
});

export const members = [member("u-charlie", "Charlie", "MOTHER"), member("u-dad", "Jonas", "FATHER"), member("u-inger", "Inger", "GRANDMOTHER_MAT")];

export const categories: CategoryDto[] = [
  ...SYSTEM_CATEGORIES.map((c, i) => ({
    id: systemCategoryId(c.key),
    key: c.key,
    name: null,
    icon: c.icon,
    tone: c.tone,
    sortOrder: i,
    ownedByMe: false,
    archived: false,
  })),
  { id: "cat-dental", key: null, name: "Dental", icon: "medical_services", tone: "SAND", sortOrder: 99, ownedByMe: true, archived: false },
];

const event = (e: Partial<CalendarEventDto> & Pick<CalendarEventDto, "id" | "title" | "startsAt">): CalendarEventDto => ({
  childId: "c-leo",
  kind: "EVENT",
  categoryId: null,
  endsAt: null,
  allDay: false,
  notes: null,
  location: null,
  address: null,
  assigneeUserId: null,
  editable: true,
  assignedNote: null,
  contactName: null,
  contactDetail: null,
  confirmable: false,
  confirmedByUserIds: [],
  checklist: [],
  recurrenceIntervalWeeks: null,
  recurrenceEndsAt: null,
  ...e,
});

const todayEvents: CalendarEventDto[] = [
  event({
    id: "e-dropoff",
    title: "School drop-off",
    startsAt: "2026-10-12T06:30:00Z",
    categoryId: "cat_routine",
    location: "Oakwood Elementary",
    address: "452 Elmwood Ave, 23462 Pasadena",
    checklist: [
      { id: "ck1", kind: "TASK", label: "Sign reading log", isChecked: false, sortOrder: 0 },
      { id: "ck2", kind: "TASK", label: "Hand over lunch bag & water bottle", isChecked: false, sortOrder: 1 },
    ],
  }),
  event({
    id: "e-dentist",
    title: "Dentist Checkup",
    startsAt: "2026-10-12T10:15:00Z",
    categoryId: "cat_health",
    location: "Dr. Lind Dental Studio",
    address: "742 Evergreen Terr",
    notes: "Bring the insurance card.",
  }),
  event({
    id: "e-soccer",
    title: "Soccer Practice",
    startsAt: "2026-10-12T13:00:00Z",
    categoryId: "cat_sport",
    location: "Oakwood Soccer Field",
    address: "Field 3 • Pickup by Sara at 4:30 PM",
    assigneeUserId: "u-dad",
    checklist: [{ id: "ck3", kind: "PACKING", label: "Shin guards", isChecked: false, sortOrder: 0 }],
  }),
];

// One dot on each other day of the week; the 16th is a health (rose) one.
const weekDots = [13, 14, 15, 16, 17, 18].map((d) =>
  event({ id: `e-dot-${d}`, title: `Dot ${d}`, startsAt: `2026-10-${d}T08:00:00Z`, categoryId: d === 16 ? "cat_health" : "cat_routine" }),
);

const byDate: Record<string, string | null> = {};
for (let d = new Date("2026-09-28T00:00:00Z"); d <= new Date("2026-11-08T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
  const key = d.toISOString().slice(0, 10);
  byDate[key] = key >= "2026-10-12" && key <= "2026-10-18" ? "u-charlie" : "u-dad";
}

export const inboundSwap: SwapRequestDto = {
  id: "s-1",
  date: "2027-06-07",
  requestedById: "u-inger",
  status: "PENDING",
  message: null,
  createdAt: "2026-10-10T10:00:00Z",
  resolvedAt: null,
};

export const leoOverview = (opts: { swaps?: SwapRequestDto[] } = {}): ChildOverview => ({
  childId: "c-leo",
  members,
  custody: {
    plan: { id: "p1", label: "Week on / week off", startDate: "2026-01-05", patternDays: [7, 7] as never, handoverTime: "15:00", handoverLocation: "Oakwood School" },
    byDate,
    today: {
      holderUserId: "u-charlie",
      dayOfBlock: 7,
      blockLengthDays: 7,
      nextHandover: { date: "2026-10-16", time: "15:00", location: "Oakwood School", toUserId: "u-dad" },
    },
  },
  events: [...todayEvents, ...weekDots],
  tasks: [
    { id: "t1", childId: "c-leo", title: "Return signed field trip permission slip", note: null, categoryId: null, dueOn: null, createdByUserId: "u-charlie", completedAt: null, completedByUserId: null, createdAt: "2026-10-10T08:00:00Z" },
    { id: "t2", childId: "c-leo", title: "Pediatric allergy medicine", note: "Pickup at pharmacy before 5pm.", categoryId: "cat_health", dueOn: null, createdByUserId: "u-charlie", completedAt: null, completedByUserId: null, createdAt: "2026-10-10T08:00:00Z" },
    { id: "t3", childId: "c-leo", title: "Wash soccer shin guards & jersey", note: null, categoryId: null, dueOn: null, createdByUserId: "u-dad", completedAt: null, completedByUserId: null, createdAt: "2026-10-10T08:00:00Z" },
    { id: "t4", childId: "c-leo", title: "Pack spare rain boots for preschool", note: null, categoryId: null, dueOn: null, createdByUserId: "u-dad", completedAt: null, completedByUserId: null, createdAt: "2026-10-10T08:00:00Z" },
  ],
  notes: [
    { id: "n1", childId: "c-leo", title: "Lunch preference for Maya", text: "Maya mentioned she prefers sliced apples over bananas today. Teacher notified about snack time.", categoryId: null, authorUserId: "u-charlie", createdAt: "2026-10-12T05:45:00Z", updatedAt: "2026-10-12T05:45:00Z" },
    { id: "n2", childId: "c-leo", title: "Dentist follow-up notes", text: "Dr. Lind suggested scheduling regular fluoride treatment next October. Teeth look great, no cavities.", categoryId: "cat-dental", authorUserId: "u-dad", createdAt: "2026-10-12T10:40:00Z", updatedAt: "2026-10-12T10:40:00Z" },
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  lessons: [
    { id: "l1", childId: "c-leo", weekday: 1, startTime: "09:00", endTime: null, subject: "Math & Logic", room: "Room 14", note: null, bring: null },
    { id: "l2", childId: "c-leo", weekday: 1, startTime: "10:15", endTime: null, subject: "Reading & Creative Writing", room: "Library", note: null, bring: null },
    { id: "l3", childId: "c-leo", weekday: 1, startTime: "11:30", endTime: null, subject: "Science Lab", room: "Lab 2", note: null, bring: null },
    { id: "l4", childId: "c-leo", weekday: 1, startTime: "13:00", endTime: null, subject: "Physical Education", room: "Gym", note: null, bring: "Gym gear packed in backpack" },
    { id: "l5", childId: "c-leo", weekday: 1, startTime: "14:15", endTime: null, subject: "Arts & Crafts", room: "Studio A", note: null, bring: null },
  ],
  pendingSwaps: opts.swaps ?? [],
  packing: {
    forDate: "2026-10-16",
    items: ["Rain jacket", "Reading book", "Inhaler", "Teddy"].map((label, i) => ({ id: `p${i}`, label, sortOrder: i, packed: i < 3 })),
  },
  can: { manageEvents: true, requestSwap: true, approveSwap: true, editCustody: true },
});

export const overview = (child: ChildOverview): OverviewResponse => ({
  from: "2026-09-28",
  to: "2026-11-08",
  today: FIXTURE_TODAY,
  children: [child],
});
