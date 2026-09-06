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
  completed: boolean;
  completedAt: string | null;
};

export type ChildScheduleResponse = {
  items: ScheduleItem[];
  completedCount: number;
  totalCount: number;
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
  // HOLIDAY rows are system-seeded (see apps/api's dkHolidays helper) and
  // can't be edited/deleted through the calendar-events endpoints.
  editable: boolean;
  // Only meaningful for APPOINTMENT rows — marks a doctor/dentist/etc. visit
  // vs. a general appointment (school event, activity, ...). The child's
  // Medical Info "Appointments" section filters on this instead of showing
  // every appointment on the calendar.
  isMedical: boolean;
};

export type CreateCalendarEventRequest = {
  category: Extract<CalendarEventCategory, "APPOINTMENT" | "PLANNED_HOLIDAY">;
  title: string;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  notes?: string;
  isMedical?: boolean;
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

export type CommentDto = {
  id: string;
  authorId: string;
  authorName: string;
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
  text: string;
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
  sizeValue: string | null;
  claimedById: string | null;
  claimedByName: string | null;
  createdAt: string;
};

export type CreateListItemRequest = {
  type: ListItemType;
  title: string;
  sizeValue?: string;
};

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export type ThreadMemberDto = {
  userId: string;
  firstName: string;
  lastName: string;
};

export type MessageDto = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
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

export type PersonalNoteDto = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePersonalNoteRequest = {
  text: string;
};

export type UpdatePersonalNoteRequest = {
  text: string;
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
  tier: Extract<SubscriptionTier, "PARENTS" | "FAMILY">;
  billingPeriod: BillingPeriod;
};

export type SubscribeResponse = {
  redirectUrl: string;
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

export type VapidPublicKeyResponse = {
  publicKey: string;
};
