import type {
  ChildDetail,
  ChildFamilyMember,
  ChildSummary,
  CustodyPlanStatusResponse,
  EmergencyContactDto,
  GrowthEntryDto,
  ListItemDto,
  ScheduleItem,
} from "@kidcom/shared";

import { FIXTURE_NOW } from "./calendarFixture";

// The Lists / Children / Child profile sample content from kidcom_lists,
// kidcom_children and kidcom_child_profile_1/_2 (the Stenbeck family).
// "Now" is the calendar fixture's Monday 12 October 2026, 09:00 Copenhagen.

export { FIXTURE_NOW };

const kid = (id: string, firstName: string, lastName: string, gender: ChildSummary["gender"], birthday: string, extra: Partial<ChildSummary> = {}): ChildSummary => ({
  id,
  firstName,
  lastName,
  gender,
  birthday,
  profileImageUrl: `a-${id}`,
  clothingSize: null,
  shoeSize: null,
  coverImageUrl: null,
  myRole: "PARENT",
  myRelationship: "MOTHER",
  canEdit: true,
  ...extra,
});

export const august = kid("c-august", "August", "Stenbeck", "BOY", "2015-07-31", { clothingSize: "164/170", shoeSize: "EU 41", coverImageUrl: "cover-august" });
export const someKid = kid("c-some", "Some", "kid", "GIRL", "2022-10-17", { canEdit: false });
export const idaS = kid("c-ida-s", "Ida", "Stenbeck", "BOY", "2026-08-12", { myRole: "FAMILY", myRelationship: "AUNT", canEdit: false });
export const stenbecks = [august, someKid, idaS];

export const augustDetail: ChildDetail = { ...august, heightCm: 148, countryCode: "DK" };

const member = (userId: string, firstName: string, lastName: string, relationship: ChildFamilyMember["relationship"], invitedByUserId: string | null = null): ChildFamilyMember => ({
  userId,
  firstName,
  lastName,
  avatarUrl: `a-${userId}`,
  role: relationship === "FATHER" || relationship === "MOTHER" ? "PARENT" : "FAMILY",
  relationship,
  isMinorMember: false,
  invitedByUserId,
});

export const stenbeckFamily: ChildFamilyMember[] = [
  member("u-anna", "Anna", "Stenbeck", "MOTHER"),
  member("u-charlie", "Charlie", "Stenbeck", "FATHER"),
  member("u-inger", "Inger", "Lind", "GRANDMOTHER_MAT", "u-charlie"),
  member("u-andrea", "Andrea", "Lind", "AUNT", "u-anna"),
];

export const custody: CustodyPlanStatusResponse = {
  plan: {
    id: "plan-1",
    label: "7/7",
    startDate: "2021-09-07T00:00:00.000Z",
    patternDays: { cycleLengthDays: 14, blocks: [{ userId: "u-anna", days: 7 }, { userId: "u-charlie", days: 7 }] },
    handoverTime: "15:00",
    handoverLocation: null,
  },
  locked: false,
  daysUntilLocked: null,
};

const g = (id: string, measuredAt: string, heightCm: number | null, weightKg: number | null): GrowthEntryDto => ({ id, measuredAt, heightCm, weightKg, note: null });
export const growth: GrowthEntryDto[] = [
  g("g1", "2025-04-10T08:00:00.000Z", 141.1, 42),
  g("g2", "2025-10-08T08:00:00.000Z", 142.6, 44),
  g("g3", "2026-04-11T08:00:00.000Z", 144, 46),
  g("g4", "2026-10-12T06:42:00.000Z", 148.2, 48),
];

export const contacts: EmergencyContactDto[] = [
  { id: "ec1", category: "MEDICAL", name: "Dr. Lind", role: "Pediatrician", phone: "+4533112233", location: null, avatarUrl: null, derived: false },
  { id: "ec2", category: "MEDICAL", name: "Tandplejen", role: "Dentist", phone: "+4533445566", location: null, avatarUrl: null, derived: false },
  { id: "ec3", category: "OTHER", name: "Oakwood School", role: "School", phone: "+4533778899", location: null, avatarUrl: null, derived: false },
];

const s = (templateId: string, label: string, ageInMonths: number, completed: boolean, description: string | null = null, completedAt: string | null = null): ScheduleItem => ({
  templateId,
  label,
  ageInMonths,
  category: "CHECKUP",
  description,
  provider: null,
  isRecurring: false,
  sequence: 1,
  plannedAt: null,
  completed,
  completedAt,
});

export const schedule: ScheduleItem[] = [
  s("t-11", "11-Year Dental Clean & Orthodontic Screening", 134, false),
  s("t-12", "HPV Vaccine 1st Dose & Checkup", 144, false),
  s("t-125", "HPV Vaccine 2nd Dose", 150, false),
  s("t-13", "Adolescent Dental Alignment & Checkup", 156, false),
  s("t-14", "14-Year Preventive Pediatric Assessment", 168, false),
  s("t-15", "DiTe Booster & Dental Assessment", 180, false),
  s("t-16", "Adolescent Vision & General Health Screening", 192, false),
  s("t-18", "Final Pediatric Transition & Adult Health Handover", 216, false),
  s("d-10", "Pediatric Eye & Dental Checkup", 120, true, "Visual acuity chart 20/20, clean dental audit", "2025-05-15T10:00:00.000Z"),
  s("d-8", "8-Year School Dental & Posture Exam", 96, true, "Bite development & spinal symmetry screening", "2023-11-15T10:00:00.000Z"),
  s("d-6", "Pediatric Dental Examination & Fluoride", 72, true, "Eruption of first permanent molars check", "2021-09-15T10:00:00.000Z"),
  s("d-5", "DiTeKiPol Booster & School Entry Health Check", 60, true, "Primary booster vaccination before school start", "2020-08-15T10:00:00.000Z"),
  s("d-4", "MMR 2 & Routine Pediatric Screening", 48, true, "Second MMR booster shot", "2019-08-15T10:00:00.000Z"),
  s("d-3", "3-Year Pediatric Health Check & Vision Test", 36, true, "Strabismus & acuity check, fine motor assessment", "2018-08-15T10:00:00.000Z"),
  s("d-2", "2-Year Developmental & Dental Baseline", 24, true, "First municipal oral screening & language milestones", "2017-07-15T10:00:00.000Z"),
  s("d-15m", "MMR 1 (Measles, Mumps, Rubella)", 15, true, "First triple vaccine shot", "2016-10-15T10:00:00.000Z"),
  s("d-12m", "1-Year Pediatric Assessment & 3rd Dose", 12, true, "Motor milestones & 3rd primary immunisation", "2016-07-15T10:00:00.000Z"),
  s("d-5m", "DiTeKiPol / Hib / PCV (2nd Dose)", 5, true, "Second primary immunisation course", "2015-12-15T10:00:00.000Z"),
  s("d-3m", "DiTeKiPol / Hib / PCV (1st Dose)", 3, true, "Diphtheria, tetanus, pertussis, polio, Hib & pneumococcal", "2015-10-15T10:00:00.000Z"),
  s("d-5w", "5-Week Pediatric Checkup & Routine Screening", 1, true, "Growth baseline, reflex testing, neonatal hearing", "2015-08-15T10:00:00.000Z"),
];

const item = (i: Partial<ListItemDto> & Pick<ListItemDto, "id" | "childId" | "title">): ListItemDto => ({
  type: "NECESSITY",
  description: null,
  sizeValue: null,
  assignedToId: null,
  assignedToName: null,
  claimedById: null,
  claimedByName: null,
  calendarEventId: null,
  imageAssetId: null,
  dueOn: null,
  claimedAt: null,
  claimNote: null,
  claimedByAvatarUrl: null,
  createdAt: "2026-09-01T10:00:00.000Z",
  ...i,
});

export const listItems: ListItemDto[] = [
  item({ id: "li-shoes", childId: "c-august", title: "Indoor Soccer Shoes", sizeValue: "41", dueOn: "2026-09-26" }),
  item({ id: "li-uv", childId: "c-some", title: "UV Swimsuit & Sunhat Set", sizeValue: "104/110", dueOn: "2026-10-22" }),
  item({
    id: "li-boots",
    childId: "c-august",
    title: "Waterproof Rain Boots",
    sizeValue: "41",
    claimedById: "u-inger",
    claimedByName: "Inger",
    claimedByAvatarUrl: "a-u-inger",
    claimedAt: "2026-08-14T10:00:00.000Z",
    claimNote: "Bought at Magasin, size 28 in yellow color. Will bring at next handover on Friday.",
  }),
  item({ id: "li-jacket", childId: "c-august", title: "Winter Jacket", sizeValue: "164", claimedById: "u-anna", claimedByName: "Anna", claimedAt: "2026-09-02T10:00:00.000Z" }),
  item({ id: "li-socks", childId: "c-some", title: "Wool Socks", claimedById: "u-charlie", claimedByName: "Charlie", claimedAt: "2026-09-03T10:00:00.000Z" }),
];
