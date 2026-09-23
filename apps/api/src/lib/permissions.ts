import type { NextFunction, Request, Response } from "express";
import type { AccessRole, RelationshipType } from "@kidcom/shared";

import { ApiError } from "../middleware/errorHandler";

// spec §1.4 — the permission matrix, all three AccessRole columns. This
// file is the one place the matrix is encoded, so every mutating route
// under /children/:childId/* reads from here instead of repeating an
// inline `req.childAccess?.role !== "PARENT"` check per route (the pattern
// custodyPlan.ts used before this file existed).
export type Capability =
  | "custody_plan:edit"
  | "calendar_event:manage"
  | "calendar_event_request:create"
  | "calendar_event_request:approve"
  | "swap_request:create"
  | "swap_request:approve"
  | "child:edit_basic_info"
  | "medical_info:edit"
  | "growth_entry:manage"
  | "moments:post"
  | "list_item:manage"
  | "member:invite_family_or_caregiver"
  | "member:remove_family_or_caregiver"
  | "member:invite_or_remove_parent"
  | "member:remove_guardian"
  // v3.0 Phase 3 — tasks, shared notes, school timetable, handover packing.
  // Ticking a task done or an item packed is open to every member (like
  // claiming a list item); these gate creating/editing.
  | "task:manage"
  | "note:write"
  | "school:manage"
  | "packing:manage";

// Deliberately excludes AccessRole so a capability check can't silently
// return true for a role added to the enum but not yet to MATRIX —
// TypeScript forces every capability to name every known role explicitly.
const MATRIX: Record<Capability, Record<AccessRole, boolean>> = {
  // GUARDIAN is a full operational peer of PARENT on the child's own
  // record (spec §1.4, "10 Sep amendment") — every row below is identical
  // for PARENT/GUARDIAN except the four "manage people" rows at the
  // bottom, which encode the one asymmetry spec §1.4 holds onto: "a
  // guardian may manage the child, a guardian may not manage the child's
  // parents [or another guardian]".
  "custody_plan:edit": { PARENT: true, GUARDIAN: true, FAMILY: false },
  // spec §1.4: FAMILY/Caregiver get "request" here, not full create/edit —
  // that's a real request/approve workflow (like the existing SwapRequest
  // one) that doesn't exist for appointments today. Denying outright rather
  // than half-building a new subsystem in this phase — recorded
  // as a deliberate scope decision, not an oversight.
  "calendar_event:manage": { PARENT: true, GUARDIAN: true, FAMILY: false },
  // Post-launch backlog Phase C — the request/approve workflow the comment
  // above used to just point at as a future follow-up. FAMILY/Caregiver
  // still can't create an event directly, but can ask; PARENT/GUARDIAN
  // approve (mirrors swap_request:approve exactly — request creation is
  // FAMILY-open, approval isn't).
  "calendar_event_request:create": { PARENT: true, GUARDIAN: true, FAMILY: true },
  "calendar_event_request:approve": { PARENT: true, GUARDIAN: true, FAMILY: false },
  "swap_request:create": { PARENT: true, GUARDIAN: true, FAMILY: true },
  "swap_request:approve": { PARENT: true, GUARDIAN: true, FAMILY: false },
  "child:edit_basic_info": { PARENT: true, GUARDIAN: true, FAMILY: false },
  "medical_info:edit": { PARENT: true, GUARDIAN: true, FAMILY: false },
  "growth_entry:manage": { PARENT: true, GUARDIAN: true, FAMILY: false },
  "moments:post": { PARENT: true, GUARDIAN: true, FAMILY: true },
  "list_item:manage": { PARENT: true, GUARDIAN: true, FAMILY: true },
  // The asymmetry (spec §1.4, "confirmed 10 Sep"): a guardian can bring in
  // Family/Caregiver members and remove them, but cannot invite or remove a
  // PARENT, and cannot remove another GUARDIAN — closing off the path to a
  // guardian making themselves the sole adult on a child.
  "member:invite_family_or_caregiver": { PARENT: true, GUARDIAN: true, FAMILY: false },
  "member:remove_family_or_caregiver": { PARENT: true, GUARDIAN: true, FAMILY: false },
  "member:invite_or_remove_parent": { PARENT: true, GUARDIAN: false, FAMILY: false },
  "member:remove_guardian": { PARENT: true, GUARDIAN: false, FAMILY: false },
  "task:manage": { PARENT: true, GUARDIAN: true, FAMILY: true },
  "note:write": { PARENT: true, GUARDIAN: true, FAMILY: true },
  "school:manage": { PARENT: true, GUARDIAN: true, FAMILY: false },
  "packing:manage": { PARENT: true, GUARDIAN: true, FAMILY: false },
};

// Capabilities where a Caregiver (AccessRole FAMILY + relationship
// CAREGIVER) has a stricter default than a general FAMILY member (spec
// 9.5): moments comment-only (not post), media view-only (not
// upload/download-original — not enforced at the /media route, see its own
// comment for why), lists claim-only (not add/manage). A capability absent
// from this set behaves identically for every FAMILY-role holder regardless
// of relationship.
const CAREGIVER_DENIED: ReadonlySet<Capability> = new Set<Capability>([
  "swap_request:create",
  "calendar_event_request:create",
  "moments:post",
  "list_item:manage",
  "task:manage",
  "note:write",
]);

// spec 9.16 — a sibling's own account (ChildAccess.isMinorMember) gets
// "moments, media and lists only" — narrower even than a plain FAMILY
// member's default. Most of the matrix's other rows are already FAMILY:false
// and so already deny a minor member too; this set only needs to name the
// one FAMILY-allowed capability that isn't on that "moments/media/lists"
// list — requesting a custody-day swap is calendar-adjacent, not one of the
// three things a minor is meant to be able to do here.
const MINOR_MEMBER_DENIED: ReadonlySet<Capability> = new Set<Capability>(["swap_request:create", "calendar_event_request:create"]);

export function can(
  access: { role: AccessRole; relationship: RelationshipType | null; isMinorMember?: boolean },
  capability: Capability
): boolean {
  if (!MATRIX[capability][access.role]) return false;
  if (access.role === "FAMILY" && access.relationship === "CAREGIVER" && CAREGIVER_DENIED.has(capability)) {
    return false;
  }
  if (access.isMinorMember && MINOR_MEMBER_DENIED.has(capability)) {
    return false;
  }
  return true;
}

// Route-level convenience: mount after requireChildAccess (which populates
// req.childAccess). 403s with a uniform message rather than each route
// writing its own "Only parents can..." string, now that there's a shared
// vocabulary of capabilities to name in a test/log instead.
export function requireCapability(capability: Capability) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.childAccess || !can(req.childAccess, capability)) {
      next(new ApiError(403, "You don't have permission to do this"));
      return;
    }
    next();
  };
}

// Medical info viewing (spec §1.4): PARENT and GUARDIAN always (the "10 Sep
// amendment" gave Guardian full record parity, medical info included, with
// no parent-granted toggle); FAMILY/Caregiver only with the per-member
// opt-in a parent grants (ChildAccess.medicalInfoAccess) — role-blind
// between plain FAMILY and Caregiver, unlike every other
// Caregiver-restricted capability above, so it's a separate function rather
// than a MATRIX/CAREGIVER_DENIED entry.
export function canViewMedicalInfo(access: {
  role: AccessRole;
  medicalInfoAccess: boolean;
  isMinorMember?: boolean;
}): boolean {
  // spec 9.16 — "no medical info" for a minor member is absolute, not
  // subject to the normal per-member opt-in: a parent granting
  // medicalInfoAccess to a sibling's own account would put another child's
  // Art. 9 health data on a minor's account, which is exactly what 9.16
  // exists to prevent.
  if (access.isMinorMember) return false;
  return access.role === "PARENT" || access.role === "GUARDIAN" || access.medicalInfoAccess;
}
