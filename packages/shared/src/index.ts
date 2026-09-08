// Shared TypeScript types (DTOs) between apps/web and apps/api.
// Filled in as each feature area is built so the API and the SPA share one
// source of truth for request/response shapes.

// Explicit named re-exports rather than `export * from "./custody"` — a
// wildcard re-export compiles to a runtime `__exportStar` loop in the
// CommonJS output this package builds to, which trips up Vite/Rollup's
// static named-export detection for CJS packages (it silently drops names,
// including ones declared directly in this file). Explicit exports compile
// to statically analyzable per-name bindings instead.
export type { CustodyBlock, CustodyPattern, CustodyPlanLike } from "./custody";
export { resolveCustodyForDate, CUSTODY_PRESETS, describeCustodyPattern } from "./custody";
import type { CustodyPattern } from "./custody";

export type ApiHealthResponse = {
  status: "ok";
  timestamp: string;
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
};

export type SignupRequest = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

export type LoginRequest = {
  email: string;
  password: string;
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
  // Null for the account owner (never went through an invite) and for any
  // access granted before this field existed.
  familyMemberType: FamilyMemberType | null;
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

export type AccessRole = "PARENT" | "FAMILY";

// The relationship shown in the UI — separate from AccessRole, which only
// controls permissions. CO_PARENT is the only type that grants PARENT
// access; every other type is FAMILY access. Server-side is the source of
// truth for this mapping (see familyMemberTypeToRole below) — the client
// never sends an AccessRole directly when creating an invite.
export type FamilyMemberType = "CO_PARENT" | "GRANDPARENT" | "AUNT_UNCLE" | "SIBLING" | "CAREGIVER" | "OTHER";

export const FAMILY_MEMBER_TYPE_LABELS: Record<FamilyMemberType, string> = {
  CO_PARENT: "Co-Parent",
  GRANDPARENT: "Grandparent",
  AUNT_UNCLE: "Aunt / Uncle",
  SIBLING: "Sibling",
  CAREGIVER: "Caregiver",
  OTHER: "Other Family Member",
};

export function familyMemberTypeToRole(type: FamilyMemberType): AccessRole {
  return type === "CO_PARENT" ? "PARENT" : "FAMILY";
}

export type CreateInviteRequest = {
  childId: string;
  email: string;
  familyMemberType: FamilyMemberType;
};

export type CreateInviteResponse = {
  id: string;
  token: string;
};

export type AcceptInviteRequest = {
  firstName: string;
  lastName: string;
  password: string;
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
  familyMemberType: FamilyMemberType | null;
};

// ---------------------------------------------------------------------------
// Custody plans + calendar
// ---------------------------------------------------------------------------

export type CustodyPlanDto = {
  id: string;
  label: string;
  startDate: string;
  patternDays: CustodyPattern;
};

export type SetCustodyPlanRequest = {
  label: string;
  startDate: string;
  patternDays: CustodyPattern;
};

export type CalendarEventCategory = "APPOINTMENT" | "HOLIDAY" | "PLANNED_HOLIDAY";

export type CalendarEventDto = {
  id: string;
  category: CalendarEventCategory;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  notes: string | null;
  location: string | null;
  // HOLIDAY rows are system-seeded (see apps/api's dkHolidays helper) and
  // can't be edited/deleted through the calendar-events endpoints.
  editable: boolean;
  // Only meaningful for APPOINTMENT rows — marks a doctor/dentist/etc. visit
  // vs. a general appointment (school event, activity, ...). The child's
  // Medical Info "Appointments" section filters on this instead of showing
  // every appointment on the calendar.
  isMedical: boolean;
  // Same idea as isMedical, for sport/activity events.
  isSport: boolean;
  // Weekly recurrence — null means one-off. See the CalendarEvent model
  // comment in schema.prisma for the full expansion/edit-scope behavior.
  // On an expanded occurrence (not the series anchor), `id` still refers to
  // the underlying series row — editing/deleting acts on the whole series,
  // and `startsAt`/`endsAt` are that specific occurrence's date+time.
  recurrenceIntervalWeeks: number | null;
  recurrenceEndsAt: string | null;
};

export type CreateCalendarEventRequest = {
  category: Extract<CalendarEventCategory, "APPOINTMENT" | "PLANNED_HOLIDAY">;
  title: string;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  notes?: string;
  location?: string;
  isMedical?: boolean;
  isSport?: boolean;
  // Explicit `null` (as opposed to omitting the field) clears an existing
  // series when editing — needed since Update is `Partial<Create...>` and
  // an omitted field there means "leave unchanged," not "clear."
  recurrenceIntervalWeeks?: number | null;
  recurrenceEndsAt?: string | null;
};

export type UpdateCalendarEventRequest = Partial<CreateCalendarEventRequest>;

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

// ---------------------------------------------------------------------------
// Journal + media
// ---------------------------------------------------------------------------

export type MediaAssetStatus = "PROCESSING" | "READY" | "FAILED";

export type MediaAssetDto = {
  id: string;
  type: "IMAGE" | "VIDEO";
  status: MediaAssetStatus;
  width: number | null;
  height: number | null;
};

export type MediaUploadResponse = MediaAssetDto;

// One READY media asset attached to some journal post the requester can see,
// flattened out of its post for the Media Gallery screen — carries just
// enough of the parent post to group by month and jump back to it.
export type JournalMediaDto = MediaAssetDto & {
  postId: string;
  postCreatedAt: string;
  childIds: string[];
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

export type JournalPostDto = {
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
};

export type CreateJournalPostRequest = {
  title: string;
  // Optional — only the title is required to post. Media-only or
  // title-only posts are both valid.
  text?: string;
  mediaAssetIds?: string[];
  // Which children this post is tagged to. Defaults to the child in the URL
  // (`/children/:childId/journal`) when omitted, for backward compatibility.
  childIds?: string[];
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
  calendarEventId: string | null;
  createdAt: string;
};

export type CreateListItemRequest = {
  type: ListItemType;
  title: string;
  description?: string;
  sizeValue?: string;
  // NECESSITY only.
  assignedToId?: string;
  // WISHLIST only — id of a CalendarEvent (for the same child) created via
  // POST /children/:childId/calendar-events just before this request, to
  // link the two.
  calendarEventId?: string;
};

export type UpdateListItemAssignmentRequest = {
  assignedToId: string | null;
};

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
  categoryJournal: boolean;
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
