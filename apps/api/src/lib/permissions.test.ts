import { describe, it, expect } from "vitest";

import { can, canViewMedicalInfo, type Capability } from "./permissions";

// spec §1.4 — the permission matrix, row by row, all three AccessRole
// columns. Every capability this file defines gets an explicit allow/deny
// assertion for every role — "don't spot-check" per the roles/subscription
// build brief.
const PARENT = { role: "PARENT" as const, relationship: "PARENT" as const };
const GUARDIAN = { role: "GUARDIAN" as const, relationship: "GUARDIAN" as const };
const FAMILY = { role: "FAMILY" as const, relationship: "GRANDMOTHER_MAT" as const };
const CAREGIVER = { role: "FAMILY" as const, relationship: "CAREGIVER" as const };

const ALL_CAPABILITIES: Capability[] = [
  "custody_plan:edit",
  "calendar_event:manage",
  "calendar_event_request:create",
  "calendar_event_request:approve",
  "swap_request:create",
  "swap_request:approve",
  "child:edit_basic_info",
  "medical_info:edit",
  "growth_entry:manage",
  "moments:post",
  "list_item:manage",
  "member:invite_family_or_caregiver",
  "member:remove_family_or_caregiver",
  "member:invite_or_remove_parent",
  "member:remove_guardian",
];

describe("permission matrix (spec §1.4) — PARENT/GUARDIAN/FAMILY columns", () => {
  const rows: { capability: Capability; parent: boolean; guardian: boolean; family: boolean }[] = [
    { capability: "custody_plan:edit", parent: true, guardian: true, family: false },
    { capability: "calendar_event:manage", parent: true, guardian: true, family: false },
    { capability: "calendar_event_request:create", parent: true, guardian: true, family: true },
    { capability: "calendar_event_request:approve", parent: true, guardian: true, family: false },
    { capability: "swap_request:create", parent: true, guardian: true, family: true },
    { capability: "swap_request:approve", parent: true, guardian: true, family: false },
    { capability: "child:edit_basic_info", parent: true, guardian: true, family: false },
    { capability: "medical_info:edit", parent: true, guardian: true, family: false },
    { capability: "growth_entry:manage", parent: true, guardian: true, family: false },
    { capability: "moments:post", parent: true, guardian: true, family: true },
    { capability: "list_item:manage", parent: true, guardian: true, family: true },
    { capability: "member:invite_family_or_caregiver", parent: true, guardian: true, family: false },
    { capability: "member:remove_family_or_caregiver", parent: true, guardian: true, family: false },
    // The one asymmetry (spec §1.4): a guardian may manage the child, not
    // the child's parents (or another guardian).
    { capability: "member:invite_or_remove_parent", parent: true, guardian: false, family: false },
    { capability: "member:remove_guardian", parent: true, guardian: false, family: false },
  ];

  it.each(rows)(
    "$capability — PARENT allowed=$parent, GUARDIAN allowed=$guardian, FAMILY allowed=$family",
    ({ capability, parent, guardian, family }) => {
      expect(can(PARENT, capability)).toBe(parent);
      expect(can(GUARDIAN, capability)).toBe(guardian);
      expect(can(FAMILY, capability)).toBe(family);
    }
  );

  it("covers every Capability the module exports (exhaustiveness)", () => {
    const covered = new Set(rows.map((r) => r.capability));
    for (const capability of ALL_CAPABILITIES) {
      expect(covered.has(capability)).toBe(true);
    }
  });
});

describe("Guardian — full parity with Parent on the child's own record, except managing parents/guardians", () => {
  it("is a full operational peer of Parent for every record-editing capability", () => {
    const recordCapabilities: Capability[] = [
      "custody_plan:edit",
      "calendar_event:manage",
      "calendar_event_request:create",
      "calendar_event_request:approve",
      "swap_request:create",
      "swap_request:approve",
      "child:edit_basic_info",
      "medical_info:edit",
      "growth_entry:manage",
      "moments:post",
      "list_item:manage",
    ];
    for (const capability of recordCapabilities) {
      expect(can(GUARDIAN, capability)).toBe(can(PARENT, capability));
      expect(can(GUARDIAN, capability)).toBe(true);
    }
  });

  it("can invite/remove Family and Caregiver members", () => {
    expect(can(GUARDIAN, "member:invite_family_or_caregiver")).toBe(true);
    expect(can(GUARDIAN, "member:remove_family_or_caregiver")).toBe(true);
  });

  it("cannot invite or remove a Parent", () => {
    expect(can(GUARDIAN, "member:invite_or_remove_parent")).toBe(false);
  });

  it("cannot remove another Guardian", () => {
    expect(can(GUARDIAN, "member:remove_guardian")).toBe(false);
  });
});

describe("Caregiver restrictions (spec 9.5) — a strict subset of FAMILY", () => {
  it("denies swap_request:create (FAMILY may request a swap, Caregiver may not)", () => {
    expect(can(FAMILY, "swap_request:create")).toBe(true);
    expect(can(CAREGIVER, "swap_request:create")).toBe(false);
  });

  it("denies calendar_event_request:create (FAMILY may request an event, Caregiver may not — same treatment as swap requests)", () => {
    expect(can(FAMILY, "calendar_event_request:create")).toBe(true);
    expect(can(CAREGIVER, "calendar_event_request:create")).toBe(false);
  });

  it("denies moments:post (comment-only, not post)", () => {
    expect(can(FAMILY, "moments:post")).toBe(true);
    expect(can(CAREGIVER, "moments:post")).toBe(false);
  });

  it("denies list_item:manage (claim-only, not add/manage)", () => {
    expect(can(FAMILY, "list_item:manage")).toBe(true);
    expect(can(CAREGIVER, "list_item:manage")).toBe(false);
  });

  it("does not restrict capabilities FAMILY already can't do (no double-deny surprises)", () => {
    for (const capability of [
      "custody_plan:edit",
      "calendar_event:manage",
      "calendar_event_request:approve",
      "child:edit_basic_info",
    ] as Capability[]) {
      expect(can(FAMILY, capability)).toBe(false);
      expect(can(CAREGIVER, capability)).toBe(false);
    }
  });

  it("a PARENT is never restricted by relationship (the field is meaningless for PARENT)", () => {
    const parentWithType = { role: "PARENT" as const, relationship: "CAREGIVER" as const };
    expect(can(parentWithType, "swap_request:create")).toBe(true);
    expect(can(parentWithType, "moments:post")).toBe(true);
    expect(can(parentWithType, "list_item:manage")).toBe(true);
  });

  it("a GUARDIAN is never restricted by relationship either (CAREGIVER_DENIED only applies to role FAMILY)", () => {
    const guardianWithType = { role: "GUARDIAN" as const, relationship: "CAREGIVER" as const };
    expect(can(guardianWithType, "swap_request:create")).toBe(true);
    expect(can(guardianWithType, "moments:post")).toBe(true);
    expect(can(guardianWithType, "list_item:manage")).toBe(true);
  });
});

describe("canViewMedicalInfo — Parent and Guardian unconditional, FAMILY/Caregiver opt-in (spec §1.4)", () => {
  it("PARENT always sees medical info, regardless of the opt-in flag", () => {
    expect(canViewMedicalInfo({ role: "PARENT", medicalInfoAccess: false })).toBe(true);
    expect(canViewMedicalInfo({ role: "PARENT", medicalInfoAccess: true })).toBe(true);
  });

  it("GUARDIAN always sees medical info too — no parent-granted toggle needed", () => {
    expect(canViewMedicalInfo({ role: "GUARDIAN", medicalInfoAccess: false })).toBe(true);
    expect(canViewMedicalInfo({ role: "GUARDIAN", medicalInfoAccess: true })).toBe(true);
  });

  it("FAMILY sees medical info only once a parent grants the opt-in", () => {
    expect(canViewMedicalInfo({ role: "FAMILY", medicalInfoAccess: false })).toBe(false);
    expect(canViewMedicalInfo({ role: "FAMILY", medicalInfoAccess: true })).toBe(true);
  });
});
