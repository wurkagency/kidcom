// Shared TypeScript types (DTOs) between apps/web and apps/api.
// Filled in as each feature area is built so the API and the SPA share one
// source of truth for request/response shapes.

// Explicit named re-exports rather than `export * from "./custody"` — a
// wildcard re-export compiles to a runtime `__exportStar` loop in the
// CommonJS output this package builds to, which trips up Vite/Rollup's
// static named-export detection for CJS packages (it silently drops names,
// including ones declared directly in this file). Explicit exports compile
// to statically analyzable per-name bindings instead.
export type { CustodyBlock, CustodyPattern, CustodyPlanLike, CustodyBlockProgress } from "./custody";
export {
  resolveCustodyForDate,
  resolveCustodyBlockProgress,
  isCustodyHandoverDay,
  findNextHandover,
  CUSTODY_PRESETS,
  describeCustodyPattern,
} from "./custody";
import type { CustodyPattern } from "./custody";

export type { ChildMember, OwnerEntitlementData } from "./entitlement";
export { tierAtLeast, requiredTier, effectiveCoverageTier, isSatisfied, satisfyingOwnerIds } from "./entitlement";

export type { CategoryTone, SystemCategory } from "./categories";
export { CATEGORY_TONES, SYSTEM_CATEGORIES, systemCategoryId, isCategoryTone } from "./categories";
import type { CategoryTone } from "./categories";

export type { ThemeId, Locale } from "./preferences";
export {
  THEME_IDS,
  DEFAULT_THEME_ID,
  isThemeId,
  SUPPORTED_LOCALES,
  ENABLED_LOCALES,
  DEFAULT_LOCALE,
  isLocale,
} from "./preferences";
import type { ThemeId, Locale } from "./preferences";

export type ApiHealthResponse = {
  status: "ok";
  timestamp: string;
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

// Phase 6 (spec §1.3): the account-level "am I a father/mother/parent"
// question is gone — ParentRole was migrated into ChildAccess.relationship
// (Phase 5) and this column dropped. There is no longer an account-wide
// answer to that question; it's asked (and answered) per child, at
// child-creation time (CreateChildRequest.relationship below) or via an
// invite's relationship — never on the profile screen for an account with
// no children yet, matching spec §1.3's recommendation exactly.
export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
  // Verified mobile number (E.164) — null until the SMS code is confirmed.
  phone: string | null;
  phoneVerifiedAt: string | null;
  // A number awaiting its SMS code (signup, or a number change) — null when
  // nothing is pending.
  pendingPhone: string | null;
  // False until a password is set (signup sets it after phone verification;
  // Google/Microsoft accounts may never set one).
  hasPassword: boolean;
  oauthProviders: OAuthProviderId[];
  // null = not chosen; resolve with DEFAULT_THEME_ID / DEFAULT_LOCALE.
  themeId: ThemeId | null;
  locale: Locale | null;
};

export type OAuthProviderId = "google" | "microsoft";

// Signup form (kidcom_sign_up): name, email, mobile, consent. The password is
// set afterwards (POST /auth/password), once the phone is verified; the
// optional `password` here is for clients that collect it up front.
export type SignupRequest = {
  email: string;
  password?: string;
  firstName: string;
  lastName?: string;
  // Mandatory, E.164 ("+4520123456"). An SMS code is sent at signup.
  phone: string;
  // Required true — POST /auth/signup rejects anything else. Recorded as
  // User.termsAcceptedAt, a real timestamp rather than a UI-only gate.
  acceptedTerms: boolean;
};

export type LoginRequest = {
  email: string;
  password: string;
  // Defaults to true (today's only behavior — a 30-day session cookie).
  // false shortens the session granted once verify-2fa completes to a
  // browser-session cookie instead (cleared when the browser closes).
  rememberMe?: boolean;
};

export type MeResponse = {
  user: PublicUser | null;
};

// PATCH /auth/me — every field optional (partial update), same endpoint the
// avatar-only flow already used (avatarMediaAssetId). Changing `email` is a
// real security-relevant action server-side: it resets email verification
// and re-sends the confirmation email — see routes/auth/index.ts.
export type UpdateProfileRequest = {
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarMediaAssetId?: string;
  themeId?: ThemeId;
  locale?: Locale;
};

// Returned by POST /auth/login once the password check passes — a real
// session isn't granted yet, a 6-digit code has just been emailed instead.
// The client must call POST /auth/verify-2fa (which returns MeResponse) to
// actually complete login.
export type TwoFactorRequiredResponse = {
  twoFactorRequired: true;
};

export type VerifyTwoFactorRequest = {
  code: string;
};

// Post-launch backlog Phase F — password reset (confirmed to not exist at
// all beforehand: change-password required an active session + the current
// password, no path for a locked-out user). POST /auth/forgot-password
// always 204s regardless of whether the email exists — no account-
// enumeration leak.
// "email" (default): a reset link to `email`. "sms": a 6-digit code to the
// account whose verified mobile number is `phone` (E.164).
export type ForgotPasswordRequest =
  | { method?: "email"; email: string }
  | { method: "sms"; phone: string };

// Either the emailed link's token, or the SMS code from forgot-password
// (same browser session). Success signs the user in.
export type ResetPasswordRequest = {
  token?: string;
  code?: string;
  password: string;
  // Defaults to true (the screen's checkbox is checked by default).
  signOutOtherDevices?: boolean;
};

// POST /auth/phone/send — omit `phone` to resend to the pending number.
export type SendPhoneCodeRequest = {
  phone?: string;
};

export type VerifyPhoneRequest = {
  code: string;
};

// POST /auth/password — first password for an account that has none.
export type SetPasswordRequest = {
  password: string;
};

// GET /auth/oauth/pending — a Google/Microsoft identity awaiting terms
// acceptance on the signup screen.
export type PendingOAuthSignupResponse = {
  pending: { provider: OAuthProviderId; email: string; firstName: string; lastName: string } | null;
};

export type CompleteOAuthSignupRequest = {
  acceptedTerms: boolean;
};

// Simple, well-understood format check — this repo has no schema-validation
// library (zod/joi), so every server-side validator here is a small
// hand-written function like this one rather than a dependency. Not meant to
// be exhaustive RFC 5322; meant to reject "not an email at all," which is the
// actual gap this closes (every email field server-side previously only
// checked non-empty).
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

export type ChildGender = "BOY" | "GIRL" | "OTHER";

export type ChildSummary = {
  id: string;
  firstName: string;
  lastName: string;
  gender: ChildGender;
  birthday: string;
  profileImageUrl: string | null;
  clothingSize: string | null;
  shoeSize: string | null;
};

export type CreateChildRequest = {
  firstName: string;
  lastName?: string;
  gender: ChildGender;
  birthday: string;
  clothingSize?: string;
  shoeSize?: string;
  // The creator's own relationship to this child (spec §1.3). Any
  // RelationshipType is accepted (Phase 9, spec §1.4b) — a parent-shaped
  // value (FATHER/MOTHER/PARENT) grants role PARENT as before; anything
  // else grants a bootstrap GUARDIAN grant (never role FAMILY, so the
  // creator's own trial/subscription can still cover the child — spec
  // §1.4b/§2.2b). Omitted defaults to the neutral PARENT.
  relationship?: RelationshipType;
  // Required (name, plus email and/or phone) only when `relationship`
  // resolves to a bootstrap GUARDIAN grant — spec §2.2b's "capture a parent
  // contact at creation, as a required step." At least one of email/phone
  // must be given, or `wantsClaimLink: true` as the explicit fallback for
  // when neither is on hand (spec §2.2b point 3).
  parentContact?: {
    name: string;
    email?: string;
    phone?: string;
    wantsClaimLink?: boolean;
  };
};

// POST /children's response — ChildSummary, plus (only for a bootstrap
// GUARDIAN grant) what happened with the required parent-contact capture:
// an email invite was sent, or a shareable claim-link is ready to copy.
export type CreateChildResponse = ChildSummary & {
  parentInvite?: {
    token: string;
    emailSent: boolean;
  };
};

export type UpdateChildRequest = Partial<{
  firstName: string;
  lastName: string;
  gender: ChildGender;
  birthday: string;
  heightCm: number;
  clothingSize: string;
  shoeSize: string;
  profileImageMediaAssetId: string;
}>;

// Full child detail, used by the child profile / medical / contacts / growth
// pages (ChildSummary above stays the lightweight version used in lists).
export type ChildDetail = ChildSummary & {
  heightCm: number | null;
  countryCode: string;
};

// ---------------------------------------------------------------------------
// Family & connections (derived from ChildAccess, read-only from the client)
// ---------------------------------------------------------------------------

export type ChildFamilyMember = {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: AccessRole;
  // Always set now (spec §1.3, Phase 5) — the account owner's own
  // relationship is self-declared at child-creation time, not left null.
  // Also what powers "Dad's Time"/"Mom's Time" custody labeling on the
  // calendar (apps/web/src/lib/parentLabel.ts) — per-child correct, since a
  // person can be Dad to one child and Uncle to another.
  relationship: RelationshipType;
  // Phase 10 (spec 9.16) — true only for a sibling account a parent created
  // directly (POST /children/:childId/family/minor), never for anyone
  // invited by email. Lets the UI show the reduced-access badge/explanation.
  isMinorMember: boolean;
};

// Post-launch backlog Phase B — self-correction for a relationship label that
// was ever set by an arbitrary guess (the Phase 5 migration's GRANDPARENT→
// Grandmother/AUNT_UNCLE→Aunt/SIBLING→Sister defaults, or just a wrong pick
// at invite time). PATCH /children/:childId/family/:userId. Never touches
// AccessRole — see that route's own comment for why an edit is still
// rejected if it would cross the parent-shaped/non-parent-shaped boundary.
export type UpdateMemberRelationshipRequest = {
  relationship: RelationshipType;
};

// ---------------------------------------------------------------------------
// Medical info
// ---------------------------------------------------------------------------

export type MedicalInfoCategory = "ALLERGY" | "CONDITION";

export type MedicalInfoEntry = {
  id: string;
  category: MedicalInfoCategory;
  condition: string;
  description: string | null;
  emergencyNote: string | null;
};

export type CreateMedicalInfoRequest = {
  category: MedicalInfoCategory;
  condition: string;
  description?: string;
  emergencyNote?: string;
};

export type UpdateMedicalInfoRequest = Partial<CreateMedicalInfoRequest>;

// ---------------------------------------------------------------------------
// Growth entries
// ---------------------------------------------------------------------------

export type GrowthEntryDto = {
  id: string;
  measuredAt: string;
  heightCm: number | null;
  weightKg: number | null;
  note: string | null;
};

export type CreateGrowthEntryRequest = {
  measuredAt: string;
  heightCm?: number;
  weightKg?: number;
  note?: string;
};

export type UpdateGrowthEntryRequest = Partial<CreateGrowthEntryRequest>;

// ---------------------------------------------------------------------------
// Emergency contacts
// ---------------------------------------------------------------------------

export type EmergencyContactCategory = "FAMILY" | "MEDICAL" | "OTHER";

export type EmergencyContactDto = {
  id: string;
  category: EmergencyContactCategory;
  name: string;
  role: string;
  phone: string | null;
  location: string | null;
  // Only ever set for derived FAMILY rows (resolved from the real user's
  // avatarUrl via the Avatar component's media resolution) — manually-added
  // contacts have no photo field of their own, so this is always null there.
  avatarUrl: string | null;
  // true for contacts auto-derived from ChildAccess (family members who are
  // app users) — these can't be edited/deleted from this endpoint, only
  // manually-added rows can.
  derived: boolean;
};

export type CreateEmergencyContactRequest = {
  category: Exclude<EmergencyContactCategory, "FAMILY">;
  name: string;
  role: string;
  phone: string;
  location?: string;
};

export type UpdateEmergencyContactRequest = Partial<CreateEmergencyContactRequest>;

// ---------------------------------------------------------------------------
// Medical schedule templates (per-country vaccination/checkup defaults)
// ---------------------------------------------------------------------------

export type ScheduleItem = {
  templateId: string;
  label: string;
  ageInMonths: number;
  category: string;
  description: string | null;
  provider: string | null;
  isRecurring: boolean;
  sequence: number;
  plannedAt: string | null;
  completed: boolean;
  completedAt: string | null;
};

export type ChildScheduleResponse = {
  items: ScheduleItem[];
  completedCount: number;
  totalCount: number;
};

export type UpdateScheduleOccurrenceRequest = {
  plannedAt?: string | null;
  completed?: boolean;
};

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export type AccessRole = "PARENT" | "GUARDIAN" | "FAMILY";

// The relationship shown in the UI ("Grandmother", "Dad", ...) — separate
// from AccessRole, which only controls permissions. Replaces
// FamilyMemberType (spec §1.3/§8, Phase 5). Server-side is the source of
// truth for the relationship -> role mapping (see relationshipTypeToRole
// below) — the client never sends an AccessRole directly when creating an
// invite. CO_PARENT is gone (spec §1.2) — it was a position relative to the
// other adult, not a relationship to the child; inviting a co-parent now
// means inviting someone as FATHER/MOTHER/PARENT directly.
export type RelationshipType =
  | "FATHER"
  | "MOTHER"
  | "PARENT"
  | "STEP_FATHER"
  | "STEP_MOTHER"
  | "FOSTER_FATHER"
  | "FOSTER_MOTHER"
  | "GUARDIAN"
  | "GRANDFATHER_PAT"
  | "GRANDFATHER_MAT"
  | "GRANDMOTHER_PAT"
  | "GRANDMOTHER_MAT"
  | "UNCLE"
  | "AUNT"
  | "BROTHER"
  | "SISTER"
  | "CAREGIVER"
  | "OTHER";

// Warm register throughout (spec 9.2), except Grandfather/Grandmother which
// stay formal per 9.15 (not side-specific in English — farmor/mormor and
// farfar/morfar are distinguished by the *value* self-declared at invite
// time, spec §1.2 note 5, not by a different printed word).
export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  FATHER: "Dad",
  MOTHER: "Mom",
  PARENT: "Parent",
  STEP_FATHER: "Step-Dad",
  STEP_MOTHER: "Step-Mom",
  FOSTER_FATHER: "Foster Dad",
  FOSTER_MOTHER: "Foster Mom",
  GUARDIAN: "Guardian",
  GRANDFATHER_PAT: "Grandfather",
  GRANDFATHER_MAT: "Grandfather",
  GRANDMOTHER_PAT: "Grandmother",
  GRANDMOTHER_MAT: "Grandmother",
  UNCLE: "Uncle",
  AUNT: "Aunt",
  BROTHER: "Brother",
  SISTER: "Sister",
  CAREGIVER: "Caregiver",
  OTHER: "Family member",
};

// Every known value, derived from the labels map so the two can never drift
// apart — used for request validation (invites/index.ts, children/index.ts)
// and the invite-relationship picker (OnboardingInvitePage.tsx).
export const ALL_RELATIONSHIP_TYPES = Object.keys(RELATIONSHIP_TYPE_LABELS) as RelationshipType[];

// spec §1.4b — a parent-shaped self-declaration (FATHER/MOTHER/PARENT) is
// the one case where a *creator's own* bootstrap grant gets role PARENT;
// every other relationship gets role GUARDIAN instead (see
// children/index.ts's POST / — deliberately not routed through
// relationshipTypeToRole, which answers a different question: what role an
// *invitee* onto an existing child gets).
export function isParentShapedRelationship(relationship: RelationshipType): boolean {
  return relationship === "FATHER" || relationship === "MOTHER" || relationship === "PARENT";
}

// spec §1.2/§1.4b: FATHER/MOTHER/PARENT -> PARENT; STEP_*/FOSTER_*/GUARDIAN
// -> GUARDIAN (9.17/9.17a); everything else -> FAMILY. This is the mapping
// used when an *existing* child gains a new member via invite — the
// creator-bootstrap case (spec §1.4b/§2.2b, Phase 9) is a deliberately
// different code path with a different output for the same input
// relationship, and must never call this function.
export function relationshipTypeToRole(type: RelationshipType): AccessRole {
  if (type === "FATHER" || type === "MOTHER" || type === "PARENT") return "PARENT";
  if (type === "STEP_FATHER" || type === "STEP_MOTHER" || type === "FOSTER_FATHER" || type === "FOSTER_MOTHER" || type === "GUARDIAN") {
    return "GUARDIAN";
  }
  return "FAMILY";
}

export type CreateInviteRequest = {
  childId: string;
  email: string;
  relationship: RelationshipType;
};

export type CreateInviteResponse = {
  id: string;
  token: string;
};

export type AcceptInviteRequest = {
  firstName: string;
  lastName: string;
  password: string;
  // No parentRole field (Phase 6) — the invitee's relationship to the
  // child was already fixed by whoever sent the invite (Invite.relationship,
  // set at CreateInviteRequest time), not something the invitee re-declares
  // for themselves here.
  // Required only for a shareable claim-link (spec §2.2b point 3) — an
  // invite created with no email on file (Invite.email null), shared over
  // whatever channel is convenient rather than sent by KidCom itself. A
  // normal invite ignores this field (the account is created for
  // Invite.email, not whatever the acceptor types here).
  email?: string;
};

// GET /invites/:token — lets the accept page branch on the invite's state
// before rendering a form (invalid/expired/already-accepted, or an account
// already existing for the invited email) instead of only discovering it on
// submit.
export type InvitePreviewResponse = {
  valid: boolean;
  reason?: "not_found" | "already_accepted";
  email: string | null;
  childName: string | null;
  inviterName: string | null;
  userExists: boolean;
  relationship: RelationshipType | null;
};

// ---------------------------------------------------------------------------
// Custody plans + calendar
// ---------------------------------------------------------------------------

export type CustodyPlanDto = {
  id: string;
  label: string;
  startDate: string;
  patternDays: CustodyPattern;
  /** "HH:mm", Europe/Copenhagen wall clock; null = the day belongs to the receiving parent */
  handoverTime: string | null;
  handoverLocation: string | null;
};

// GET /children/:childId/custody-plan — spec 9.8's persistent-banner data
// (post-launch backlog Phase D): `locked` mirrors what a PUT would 403 with
// right now; `daysUntilLocked` is a countdown to show *before* that happens,
// null whenever the lock condition doesn't apply at all (0 or 2+ parents —
// not "0 days").
export type CustodyPlanStatusResponse = {
  plan: CustodyPlanDto | null;
  locked: boolean;
  daysUntilLocked: number | null;
};

export type SetCustodyPlanRequest = {
  label: string;
  startDate: string;
  patternDays: CustodyPattern;
  handoverTime?: string | null;
  handoverLocation?: string | null;
};

// ---------------------------------------------------------------------------
// Categories — one set shared by Calendar, Moments and Media
// ---------------------------------------------------------------------------

export type CategoryDto = {
  id: string;
  /** System categories: translation key (`categories.<key>`); custom: null */
  key: string | null;
  /** Custom categories: the owner's name for it; system: null */
  name: string | null;
  icon: string;
  tone: CategoryTone;
  sortOrder: number;
  /** Only the owner may change a custom category. */
  ownedByMe: boolean;
  /** Archived custom categories stay on existing items but aren't offered for new ones. */
  archived: boolean;
};

export type CategoriesResponse = { categories: CategoryDto[] };

export type CreateCategoryRequest = { name: string; icon: string; tone: CategoryTone };
export type UpdateCategoryRequest = Partial<CreateCategoryRequest>;

export type ChecklistKind = "TASK" | "PACKING";

export type CalendarEventChecklistItemDto = {
  id: string;
  kind: ChecklistKind;
  label: string;
  isChecked: boolean;
  sortOrder: number;
};

export type CalendarEventKind = "EVENT" | "NATIONAL_HOLIDAY";

export type CalendarEventDto = {
  id: string;
  childId: string;
  kind: CalendarEventKind;
  categoryId: string | null;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  notes: string | null;
  /** Place name ("Oakwood Elementary") */
  location: string | null;
  /** Street address, for the directions link */
  address: string | null;
  /** "Handled by …" */
  assigneeUserId: string | null;
  // National holidays are system-seeded (apps/api dkHolidays) and can't be
  // edited or deleted through the calendar-events endpoints.
  editable: boolean;
  // Free-text note on who/what this event is for, beyond the assigned
  // child(ies) — e.g. "Leo & Maya", "Whole family". Purely descriptive.
  assignedNote: string | null;
  // Optional contact card (doctor's office, coach, school office, ...).
  contactName: string | null;
  contactDetail: string | null;
  // Opt-in per event — when true, family members can confirm attendance/
  // awareness via PATCH .../confirm. `confirmedByUserIds` lists who has.
  confirmable: boolean;
  confirmedByUserIds: string[];
  checklist: CalendarEventChecklistItemDto[];
  // Weekly recurrence — null means one-off. See the CalendarEvent model
  // comment in schema.prisma for the full expansion/edit-scope behavior.
  // On an expanded occurrence (not the series anchor), `id` still refers to
  // the underlying series row — editing/deleting acts on the whole series,
  // and `startsAt`/`endsAt` are that specific occurrence's date+time.
  recurrenceIntervalWeeks: number | null;
  recurrenceEndsAt: string | null;
};

export type CreateCalendarEventRequest = {
  categoryId?: string | null;
  title: string;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  notes?: string;
  location?: string;
  address?: string;
  /** Must be a member of the child; null clears it */
  assigneeUserId?: string | null;
  assignedNote?: string;
  contactName?: string;
  contactDetail?: string;
  confirmable?: boolean;
  // Full-replace on edit: a PATCH with this field set deletes and recreates
  // the event's checklist rows from this list (order = array order). Omit
  // to leave the existing checklist unchanged.
  checklist?: { label: string; kind?: ChecklistKind }[];
  // Explicit `null` (as opposed to omitting the field) clears an existing
  // series when editing — needed since Update is `Partial<Create...>` and
  // an omitted field there means "leave unchanged," not "clear."
  recurrenceIntervalWeeks?: number | null;
  recurrenceEndsAt?: string | null;
};

export type UpdateCalendarEventRequest = Partial<CreateCalendarEventRequest>;

// PATCH /children/:childId/calendar-events/:id/checklist/:itemId
export type ToggleChecklistItemRequest = {
  isChecked: boolean;
};

// PATCH /children/:childId/calendar-events/:id/confirm — always acts on the
// caller's own userId (from the session), never a body-supplied one.
export type ToggleConfirmationRequest = {
  confirmed: boolean;
};

export type CalendarRangeResponse = {
  custodyByDate: Record<string, string | null>; // "YYYY-MM-DD" -> userId
  events: CalendarEventDto[];
};

export type SwapRequestStatus = "PENDING" | "APPROVED" | "DECLINED";

export type SwapRequestDto = {
  id: string;
  date: string;
  requestedById: string;
  status: SwapRequestStatus;
  message: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type CreateSwapRequestRequest = {
  date: string;
  message?: string;
};

export type ResolveSwapRequestRequest = {
  status: Extract<SwapRequestStatus, "APPROVED" | "DECLINED">;
};

// Post-launch backlog Phase C — close sibling of SwapRequest above, for
// FAMILY/Caregiver members asking a PARENT/GUARDIAN to add a calendar event
// rather than being able to add one directly (spec §1.4's "request" column
// for calendar_event:manage, never built until now). Reuses SwapRequestStatus
// rather than a duplicate enum — same three values, same meaning.
export type CalendarEventRequestDto = {
  id: string;
  categoryId: string | null;
  title: string;
  startsAt: string;
  endsAt: string | null;
  notes: string | null;
  requestedById: string;
  status: SwapRequestStatus;
  message: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type CreateCalendarEventRequestRequest = {
  categoryId?: string | null;
  title: string;
  startsAt: string;
  endsAt?: string;
  notes?: string;
  message?: string;
};

export type ResolveCalendarEventRequestRequest = {
  status: Extract<SwapRequestStatus, "APPROVED" | "DECLINED">;
};

// ---------------------------------------------------------------------------
// Tasks, shared notes, school timetable, handover packing
// ---------------------------------------------------------------------------

export type TaskDto = {
  id: string;
  childId: string;
  title: string;
  note: string | null;
  categoryId: string | null;
  /** "YYYY-MM-DD" */
  dueOn: string | null;
  createdByUserId: string | null;
  completedAt: string | null;
  completedByUserId: string | null;
  createdAt: string;
};

export type CreateTaskRequest = {
  title: string;
  note?: string | null;
  categoryId?: string | null;
  dueOn?: string | null;
};
export type UpdateTaskRequest = Partial<CreateTaskRequest> & { completed?: boolean };

export type ChildNoteDto = {
  id: string;
  childId: string;
  title: string;
  text: string | null;
  categoryId: string | null;
  /** null once the author has left KidCom ("Former member") */
  authorUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateChildNoteRequest = { title: string; text?: string | null; categoryId?: string | null };
export type UpdateChildNoteRequest = Partial<CreateChildNoteRequest>;

export type SchoolLessonDto = {
  id: string;
  childId: string;
  /** ISO weekday: 1 = Monday … 7 = Sunday */
  weekday: number;
  /** "HH:mm" */
  startTime: string;
  endTime: string | null;
  subject: string;
  room: string | null;
  note: string | null;
  /** Something to pack that day ("Gym gear") — drives the school routine reminder */
  bring: string | null;
};

export type CreateSchoolLessonRequest = Omit<SchoolLessonDto, "id" | "childId" | "endTime" | "room" | "note" | "bring"> & {
  endTime?: string | null;
  room?: string | null;
  note?: string | null;
  bring?: string | null;
};
export type UpdateSchoolLessonRequest = Partial<CreateSchoolLessonRequest>;

export type HandoverPackingItemDto = {
  id: string;
  label: string;
  sortOrder: number;
  /** Packed for the upcoming handover */
  packed: boolean;
};

/** Full replace of the list's labels (order = array order); ids keep packed state. */
export type SetHandoverPackingRequest = { items: { id?: string; label: string }[] };
export type ToggleHandoverPackingRequest = { packed: boolean };

// ---------------------------------------------------------------------------
// Overview — everything the Today and calendar screens show, in one call
// GET /overview?from=YYYY-MM-DD&to=YYYY-MM-DD[&childIds=a,b]
// ---------------------------------------------------------------------------

export type CustodyNow = {
  holderUserId: string;
  dayOfBlock: number;
  blockLengthDays: number;
  /** The next change of hands after today, if the plan has one */
  nextHandover: {
    /** "YYYY-MM-DD" */
    date: string;
    time: string | null;
    location: string | null;
    toUserId: string;
  } | null;
};

export type ChildOverview = {
  childId: string;
  members: ChildFamilyMember[];
  custody: {
    plan: CustodyPlanDto | null;
    /** "YYYY-MM-DD" → userId holding the child that day */
    byDate: Record<string, string | null>;
    today: CustodyNow | null;
  };
  events: CalendarEventDto[];
  /** Open tasks, plus tasks completed within the range */
  tasks: TaskDto[];
  /** Notes written within the range, newest first */
  notes: ChildNoteDto[];
  /** The whole weekly timetable */
  lessons: SchoolLessonDto[];
  /** Swap requests awaiting an answer */
  pendingSwaps: SwapRequestDto[];
  packing: { forDate: string | null; items: HandoverPackingItemDto[] };
  /** What the caller may do for this child */
  can: {
    manageEvents: boolean;
    requestSwap: boolean;
    approveSwap: boolean;
    editCustody: boolean;
  };
};

export type OverviewResponse = {
  from: string;
  to: string;
  /** "YYYY-MM-DD" of today in Europe/Copenhagen, as the server sees it */
  today: string;
  children: ChildOverview[];
};

// ---------------------------------------------------------------------------
// Moments + media
// ---------------------------------------------------------------------------

export type MediaAssetStatus = "PROCESSING" | "READY" | "FAILED";

export type MediaAssetDto = {
  id: string;
  type: "IMAGE" | "VIDEO";
  status: MediaAssetStatus;
  width: number | null;
  height: number | null;
  /** Videos: length in seconds */
  durationSeconds: number | null;
};

/** GET /media/:id/info — the viewer's details sheet and the download screen. */
export type MediaInfoDto = MediaAssetDto & {
  mimeType: string | null;
  /** e.g. "hevc", "h264" (videos) */
  codec: string | null;
  originalBytes: number | null;
  /** The in-app version: WebP for photos, the H.264 transcode for videos */
  optimizedBytes: number | null;
  bookmarkedByMe: boolean;
  moment: {
    id: string;
    childIds: string[];
    title: string;
    authorId: string;
    authorName: string;
    authorAvatarUrl: string | null;
    categoryId: string | null;
    location: string | null;
    occurredOn: string | null;
    createdAt: string;
    /** This asset's position among the moment's media */
    index: number;
    mediaIds: string[];
  } | null;
};

export type MediaDownloadVariant = "original" | "optimized";
export type MediaArchiveRequest = { mediaIds: string[]; variant: MediaDownloadVariant };

export type MediaUploadResponse = MediaAssetDto;

// One READY media asset attached to some moment the requester can see,
// flattened out of its post for the Media Gallery screen — carries just
// enough of the parent post to group by month and jump back to it.
export type MomentMediaDto = MediaAssetDto & {
  postId: string;
  postCreatedAt: string;
  childIds: string[];
  postTitle: string;
  categoryId: string | null;
  occurredOn: string | null;
  bookmarkedByMe: boolean;
  /** As uploaded */
  originalBytes: number | null;
  /** The in-app version (WebP photo / H.264 video) */
  optimizedBytes: number | null;
};

export type CommentDto = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  text: string;
  createdAt: string;
};

export type CreateCommentRequest = {
  text: string;
};

export type UpdateCommentRequest = {
  text: string;
};

export type MomentDto = {
  id: string;
  childIds: string[];
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  title: string;
  text: string;
  createdAt: string;
  media: MediaAssetDto[];
  commentCount: number;
  reactionCount: number;
  reactedByMe: boolean;
  categoryId: string | null;
  /** Typed place name ("Oakwood Little League Field") */
  location: string | null;
  /** "YYYY-MM-DD" — the day it happened (defaults to the posting day) */
  occurredOn: string | null;
  /** false = parents/guardians only */
  familyVisible: boolean;
  bookmarkedByMe: boolean;
};

export type MomentsPage = { items: MomentDto[]; nextCursor: string | null };

/** Feed / gallery "Types" filter */
export type MomentMediaType = "photo" | "video" | "text";

export type UpdateMomentRequest = Partial<
  Pick<CreateMomentRequest, "title" | "text" | "categoryId" | "location" | "occurredOn" | "familyVisible">
>;

export type BookmarksResponse = { moments: MomentDto[]; media: MomentMediaDto[] };
export type CreateBookmarkRequest = { momentId: string } | { mediaAssetId: string };

export type CreateMomentRequest = {
  title: string;
  // Optional — only the title is required to post. Media-only or
  // title-only posts are both valid.
  text?: string;
  mediaAssetIds?: string[];
  // Which children this post is tagged to. Defaults to the child in the URL
  // (`/children/:childId/moments`) when omitted, for backward compatibility.
  childIds?: string[];
  categoryId?: string | null;
  location?: string | null;
  /** "YYYY-MM-DD" */
  occurredOn?: string | null;
  /** Default true; false hides it from extended family */
  familyVisible?: boolean;
  /** Push a friendly notification to the rest of the family */
  notify?: boolean;
};

// ---------------------------------------------------------------------------
// Shared lists
// ---------------------------------------------------------------------------

export type ListItemType = "NECESSITY" | "WISHLIST";

export type ListItemDto = {
  id: string;
  childId: string;
  type: ListItemType;
  title: string;
  description: string | null;
  sizeValue: string | null;
  // Necessities: real delegation, settable by any family member.
  assignedToId: string | null;
  assignedToName: string | null;
  // Wishlist: self-claim/"Reserve".
  claimedById: string | null;
  claimedByName: string | null;
  // Wishlist only: id of an optional linked calendar event (e.g. "Birthday
  // Present"), created alongside the item so it also shows on the Calendar.
  // More than one item can share the same event id.
  calendarEventId: string | null;
  // Single optional photo — id of a MediaAsset, fetched via GET /media/:id
  // the same way Moments media is (see MediaAssetDto).
  imageAssetId: string | null;
  createdAt: string;
};

export type CreateListItemRequest = {
  type: ListItemType;
  title: string;
  description?: string;
  sizeValue?: string;
  // NECESSITY only.
  assignedToId?: string;
  // WISHLIST only — id of a CalendarEvent (for the same child), either just
  // created via POST /children/:childId/calendar-events or an existing one
  // this item is being attached to alongside other wishlist items.
  calendarEventId?: string;
  imageAssetId?: string;
};

export type UpdateListItemAssignmentRequest = {
  assignedToId: string | null;
};

// General edit of a list item's own fields — separate from
// UpdateListItemAssignmentRequest (which only ever drives the narrow
// "reassign to a family member" quick action) and from the claim/reserve
// toggle. Every field is independently optional: omitted means "leave
// unchanged", explicit `null` (where nullable) means "clear".
export type UpdateListItemRequest = Partial<{
  title: string;
  description: string | null;
  sizeValue: string | null;
  assignedToId: string | null;
  calendarEventId: string | null;
  imageAssetId: string | null;
}>;

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export type ThreadMemberDto = {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

export type MessageDto = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  text: string | null;
  mediaId: string | null;
  createdAt: string;
};

// Thread list view — includes the last message + unread flag so the list
// screen doesn't need a second round-trip per thread.
export type ThreadSummaryDto = {
  id: string;
  isGroup: boolean;
  members: ThreadMemberDto[];
  lastMessage: MessageDto | null;
  unread: boolean;
};

export type ThreadDto = {
  id: string;
  isGroup: boolean;
  members: ThreadMemberDto[];
};

export type CreateThreadRequest = {
  memberUserIds: string[];
};

export type CreateMessageRequest = {
  text?: string;
  mediaId?: string;
};

// ---------------------------------------------------------------------------
// Personal notes
// ---------------------------------------------------------------------------

export type NoteCategory = "ROUTINE" | "MILESTONE" | "HEALTH" | "GENERAL";

export type PersonalNoteDto = {
  id: string;
  text: string;
  category: NoteCategory | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePersonalNoteRequest = {
  text: string;
  category?: NoteCategory | null;
};

export type UpdatePersonalNoteRequest = {
  text?: string;
  category?: NoteCategory | null;
};

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export type SubscriptionTier = "FREE" | "PARENTS" | "FAMILY";
export type SubscriptionStatus = "TRIALING" | "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
export type BillingPeriod = "MONTHLY" | "ANNUAL";

// Danish consumer VAT rate. The prices KidCom charges (BILLING_PRICES_ORE in
// apps/api/src/lib/billingPricing.ts, and PLANS in BillingPage.tsx) are
// already gross/VAT-inclusive — confirmed as the correct, legally-required
// consumer-facing figure (spec 9.14). This is only for *displaying* the
// breakdown at checkout and on the receipt email (D9) — it never changes
// what's charged.
export const VAT_RATE = 0.25;

export type VatBreakdown = {
  grossMinorUnits: number;
  netMinorUnits: number;
  vatMinorUnits: number;
  vatRatePercent: number;
};

// Single source of truth for gross -> net/VAT math, so checkout copy and the
// receipt email can never drift apart on rounding. Operates in whatever
// minor unit is passed in (øre for the API's BILLING_PRICES_ORE; the web
// app converts its DKK display prices to øre before calling this, and back
// to DKK for display) — rounds once, at the net figure, matching how a real
// Danish faktura derives net from a VAT-inclusive gross price.
export function vatBreakdown(grossMinorUnits: number): VatBreakdown {
  const netMinorUnits = Math.round(grossMinorUnits / (1 + VAT_RATE));
  return {
    grossMinorUnits,
    netMinorUnits,
    vatMinorUnits: grossMinorUnits - netMinorUnits,
    vatRatePercent: VAT_RATE * 100,
  };
}

export type SubscriptionDto = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  // Derived server-side: true once trialEndsAt has passed while status is
  // still TRIALING (requireActiveAccess already blocks mutations at that
  // point — this lets the UI say so instead of showing a stale "Trial ends
  // <past date>").
  trialExpired: boolean;
};

export type SubscribeRequest = {
  tier: SubscriptionTier;
  // Required for PARENTS/FAMILY, ignored for FREE (there's no period to bill).
  billingPeriod?: BillingPeriod;
};

export type SubscribeResponse = {
  // Non-null only for a real payment-provider checkout (production, paid
  // tiers) — the caller should navigate there. Null means the switch already
  // happened server-side (FREE tier, or a non-production paid-tier switch —
  // see billing/index.ts) and the caller should just re-fetch /billing/status.
  redirectUrl: string | null;
};

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

// Matches the browser's native PushSubscription.toJSON() shape.
export type PushSubscribeRequest = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

export type NotificationPreferencesDto = {
  emailEnabled: boolean;
  googleCalendarSyncEnabled: boolean;
  office365SyncEnabled: boolean;
  categoryCalendar: boolean;
  categoryMoments: boolean;
  categoryLists: boolean;
  categoryMessages: boolean;
  doNotDisturb: boolean;
  quietHoursFrom: string;
  quietHoursTo: string;
};

export type UpdateNotificationPreferencesRequest = Partial<NotificationPreferencesDto>;

export type VapidPublicKeyResponse = {
  publicKey: string;
};

// ---------------------------------------------------------------------------
// Entitlement / upgrade requests (Phase 8, spec §2.3/§4.2)
// ---------------------------------------------------------------------------

// GET /children/:childId/coverage — the "take over this subscription" offer
// surface (spec §4.2 pt.4). requiredTier/satisfied mirror
// packages/shared/src/entitlement.ts's formula; inGraceWindow is true only
// while the child is satisfied *solely* because a covering subscription is
// inside its 7-day payment-failure grace window (spec 9.12) — the "about to
// lapse" signal a take-over prompt should key off, before it actually does.
export type ChildCoverageStatus = {
  satisfied: boolean;
  requiredTier: SubscriptionTier;
  inGraceWindow: boolean;
  // Every PARENT-role member whose own coverage currently satisfies the
  // child — i.e. who a "someone else, please take over" prompt should NOT
  // be shown to (they're already covering it).
  satisfyingParentIds: string[];
};

export type UpgradeRequestStatus = "PENDING" | "RESOLVED" | "DISMISSED";

export type UpgradeRequestDto = {
  id: string;
  requestedById: string;
  requestedByName: string;
  requiredTier: SubscriptionTier;
  status: UpgradeRequestStatus;
  createdAt: string;
};

export type CreateUpgradeRequestResponse = UpgradeRequestDto;

// ---------------------------------------------------------------------------
// Soft delete / minor member (Phase 10, spec 9.21/9.16)
// ---------------------------------------------------------------------------

// GET/POST .../delete-request — the all-PARENT-confirm (GUARDIAN-fallback-
// if-none) workflow, spec 9.21/§1.4a.4. `requiredUserIds` is always the
// *current* live set (recomputed server-side on every read/write, never a
// snapshot from when the request was opened) so a member who joins or
// leaves mid-request is picked up correctly. `null` means no request is
// currently pending for this child.
export type ChildDeletionRequestDto = {
  requestedById: string;
  requiredUserIds: string[];
  confirmedUserIds: string[];
  createdAt: string;
} | null;

// POST .../delete-request or .../delete-request/confirm — same shape as the
// GET above, plus whether this call was the one that pushed confirmations
// over the required set and actually executed the soft delete.
export type ChildDeletionActionResponse = {
  request: ChildDeletionRequestDto;
  executed: boolean;
};

// spec 9.16 — a sibling's own account, created directly by a parent rather
// than through the normal email-invite flow (a minor shouldn't need their
// own inbox to be added, and BROTHER/SISTER are refused at POST /invites
// for exactly this reason — see that route). No password: the parent is
// managing this account on the child's behalf, not handing them login
// credentials of their own, so there's nothing here for the minor to
// authenticate with themselves yet.
export type CreateMinorMemberRequest = {
  firstName: string;
  lastName?: string;
  relationship: "BROTHER" | "SISTER";
};

export type MinorMemberDto = {
  userId: string;
  firstName: string;
  lastName: string;
  relationship: RelationshipType;
};

// GET /search?q= — real, RLS-scoped results across the three kinds of
// content the Aura mockups' persistent header search field implies
// (docs/Themes/Aura's header appears on nearly every screen). No dedicated
// search-results mockup exists among the 20 Aura screens, so this follows
// the app's existing list/card conventions instead.
export type SearchResultChild = {
  id: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
};

export type SearchResultMoment = {
  id: string;
  childId: string;
  title: string;
  snippet: string;
  createdAt: string;
};

export type SearchResultListItem = {
  id: string;
  childId: string;
  title: string;
  type: ListItemType;
};

export type SearchResponse = {
  children: SearchResultChild[];
  moments: SearchResultMoment[];
  listItems: SearchResultListItem[];
};
