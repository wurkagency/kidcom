import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ALL_RELATIONSHIP_TYPES,
  RELATIONSHIP_TYPE_LABELS,
  describeCustodyPattern,
  isParentShapedRelationship,
  type ChildDetail,
  type ChildFamilyMember,
  type ChildGender,
  type CustodyPlanDto,
  type RelationshipType,
  type UpdateChildRequest,
  type UpdateMemberRelationshipRequest,
} from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { AvatarUpload } from "../components/AvatarUpload";
import { CustodySetup } from "../components/CustodySetup";
import { Icon } from "../components/Icon";
import { apiGet, apiPatch, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Matches docs/stitch_splitkid/child_profile/code.html.
export function ChildProfilePage() {
  const { childId } = useParams<{ childId: string }>();
  const { user } = useAuth();
  const [child, setChild] = useState<ChildDetail | null>(null);
  const [family, setFamily] = useState<ChildFamilyMember[]>([]);
  const [plan, setPlan] = useState<CustodyPlanDto | null>(null);
  const [showEditPlan, setShowEditPlan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberEditError, setMemberEditError] = useState<string | null>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);

  async function saveMemberRelationship(userId: string, relationship: RelationshipType) {
    if (!childId) return;
    setSavingMemberId(userId);
    setMemberEditError(null);
    try {
      await apiPatch(`/children/${childId}/family/${userId}`, { relationship } satisfies UpdateMemberRelationshipRequest);
      setFamily((prev) => prev.map((m) => (m.userId === userId ? { ...m, relationship } : m)));
      setEditingMemberId(null);
    } catch (err) {
      setMemberEditError(err instanceof ApiRequestError ? err.message : "Couldn't save that");
    } finally {
      setSavingMemberId(null);
    }
  }

  async function loadPlan() {
    if (!childId) return;
    const planRes = await apiGet<{ plan: CustodyPlanDto | null }>(`/children/${childId}/custody-plan`);
    setPlan(planRes.plan);
  }

  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    async function load() {
      try {
        const [childRes, familyRes, planRes] = await Promise.all([
          apiGet<ChildDetail>(`/children/${childId}`),
          apiGet<{ members: ChildFamilyMember[] }>(`/children/${childId}/family`),
          apiGet<{ plan: CustodyPlanDto | null }>(`/children/${childId}/custody-plan`),
        ]);
        if (cancelled) return;
        setChild(childRes);
        setFamily(familyRes.members);
        setPlan(planRes.plan);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : "Couldn't load this child");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (loading) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
      </section>
    );
  }

  if (error || !child) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-error">{error ?? "Child not found"}</p>
      </section>
    );
  }

  const age = new Date(child.birthday).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const parents = family.filter((m) => m.role === "PARENT");
  const myRole = family.find((m) => m.userId === user?.id)?.role;
  const isParent = myRole === "PARENT";
  const parentNamesById = Object.fromEntries(family.map((m) => [m.userId, m.firstName]));

  // Who may edit whose relationship label — mirrors the server's own
  // capability tiering (PATCH /children/:childId/family/:userId): always
  // your own row, a PARENT can edit anyone's, a GUARDIAN anyone but a
  // PARENT's. Purely a UI convenience — the server re-checks regardless.
  function canEditRelationship(member: ChildFamilyMember): boolean {
    if (member.userId === user?.id) return true;
    if (myRole === "PARENT") return true;
    if (myRole === "GUARDIAN") return member.role !== "PARENT";
    return false;
  }

  return (
    <div className="flex flex-col w-full pb-8">
      <div className="px-container-padding py-6 flex flex-col items-center justify-center relative bg-surface-beige text-on-surface">
        <div className="relative mb-4 rounded-full shadow-[0_4px_16px_rgba(50,105,67,0.15)] ring-4 ring-surface-beige">
          <AvatarUpload
            currentAssetId={child.profileImageUrl}
            fallbackLetter={child.firstName.charAt(0)}
            kind="child"
            size="lg"
            onUploaded={async (newAssetId) => {
              const updated = await apiPatch<ChildDetail>(`/children/${childId}`, {
                profileImageMediaAssetId: newAssetId,
              } satisfies UpdateChildRequest);
              setChild(updated);
            }}
          />
        </div>
        <h2 className="font-headline-lg text-headline-lg text-primary mb-1">
          {child.firstName} {child.lastName}
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-2">
          <Icon name="cake" className="text-[16px]" /> {age}
        </p>
      </div>

      {editing ? (
        <div className="px-container-padding mt-2 mb-section-margin flex flex-col gap-element-gap">
          <ChildEditForm
            childId={childId!}
            child={child}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => {
              setChild(updated);
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <>
          <div className="px-container-padding mt-2 mb-section-margin flex flex-col gap-element-gap">
            <div className="flex justify-between items-end mb-2">
              <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                Current Sizes
              </h3>
              <button
                onClick={() => setEditing(true)}
                className="font-label-sm text-label-sm text-primary hover:text-primary-container transition-colors"
              >
                Edit
              </button>
            </div>
            <div className="grid grid-cols-2 gap-grid-gutter">
              <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col relative overflow-hidden">
                <Icon name="checkroom" className="text-primary mb-2" />
                <span className="font-label-sm text-label-sm text-on-surface-variant mb-1">Clothing</span>
                <span className="font-headline-md text-headline-md text-on-surface">
                  {child.clothingSize ?? "—"}
                </span>
              </div>
              <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col relative overflow-hidden">
                <Icon name="footprint" className="text-secondary mb-2" />
                <span className="font-label-sm text-label-sm text-on-surface-variant mb-1">Shoe Size</span>
                <span className="font-headline-md text-headline-md text-on-surface">
                  {child.shoeSize ?? "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="px-container-padding mb-section-margin flex flex-col gap-element-gap">
            <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-2">
              Basic Info
            </h3>
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <span className="font-body-md text-body-md text-on-surface">Gender</span>
                <span className="font-label-md text-label-md text-on-surface-variant capitalize">
                  {child.gender.toLowerCase()}
                </span>
              </div>
              <div className="h-[1px] w-[calc(100%-2rem)] mx-auto bg-surface-container-highest" />
              <div className="flex items-center justify-between p-4">
                <span className="font-body-md text-body-md text-on-surface">Height</span>
                <span className="font-label-md text-label-md text-on-surface-variant">
                  {child.heightCm ? `${child.heightCm} cm` : "—"}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="px-container-padding mb-section-margin flex flex-col gap-element-gap">
        <div className="grid grid-cols-2 gap-3">
          <Link
            to={`/children/${childId}/medical`}
            className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col items-center gap-2 text-center"
          >
            <Icon name="medical_information" className="text-tertiary" />
            <span className="font-label-md text-label-md text-on-surface">Medical Info</span>
          </Link>
          <Link
            to={`/children/${childId}/contacts`}
            className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col items-center gap-2 text-center"
          >
            <Icon name="contact_support" className="text-primary" />
            <span className="font-label-md text-label-md text-on-surface">Contacts</span>
          </Link>
          <Link
            to={`/children/${childId}/growth`}
            className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col items-center gap-2 text-center"
          >
            <Icon name="monitoring" className="text-growth-green" />
            <span className="font-label-md text-label-md text-on-surface">Growth</span>
          </Link>
          <Link
            to={`/lists?child=${childId}`}
            className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col items-center gap-2 text-center"
          >
            <Icon name="checkroom" className="text-secondary" />
            <span className="font-label-md text-label-md text-on-surface">Shared List</span>
          </Link>
        </div>
      </div>

      <div className="px-container-padding mb-section-margin flex flex-col gap-element-gap">
        <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-2">
          Custody Schedule
        </h3>
        {plan === null && (
          <CustodySetup childId={childId!} parents={parents} onSaved={loadPlan} />
        )}
        {plan !== null && !showEditPlan && (
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="font-label-md text-label-md text-on-surface">{plan.label}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                {describeCustodyPattern(plan.patternDays, parentNamesById)}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Started{" "}
                {new Date(plan.startDate).toLocaleDateString(undefined, {
                  timeZone: "UTC",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            {isParent && (
              <button
                onClick={() => setShowEditPlan(true)}
                className="shrink-0 py-2 px-4 rounded-full bg-surface-container text-primary font-label-sm text-label-sm"
              >
                Edit
              </button>
            )}
          </div>
        )}
        {plan !== null && showEditPlan && (
          <CustodySetup
            childId={childId!}
            parents={parents}
            existingPlan={plan}
            onCancel={() => setShowEditPlan(false)}
            onSaved={() => {
              setShowEditPlan(false);
              loadPlan();
            }}
          />
        )}
      </div>

      <div className="px-container-padding mb-section-margin flex flex-col gap-element-gap">
        <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-2">
          Family &amp; Connections
        </h3>
        <div className="flex flex-col gap-3">
          {family.map((member) => {
            const options = ALL_RELATIONSHIP_TYPES.filter(
              (r) => isParentShapedRelationship(r) === (member.role === "PARENT")
            );
            return (
              <div
                key={member.userId}
                className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    name={`${member.firstName} ${member.lastName}`}
                    avatarAssetId={member.avatarUrl}
                    kind="adult"
                    size="md"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-md text-label-md text-on-surface">
                      {member.firstName} {member.lastName}
                    </span>
                    {editingMemberId === member.userId ? (
                      <select
                        autoFocus
                        defaultValue={member.relationship}
                        disabled={savingMemberId === member.userId}
                        onChange={(e) => saveMemberRelationship(member.userId, e.target.value as RelationshipType)}
                        onBlur={() => setEditingMemberId(null)}
                        className="mt-1 font-label-sm text-label-sm text-primary bg-surface-container rounded px-1 py-0.5 outline-none"
                      >
                        {options.map((r) => (
                          <option key={r} value={r}>
                            {RELATIONSHIP_TYPE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-label-sm text-label-sm text-primary">
                        {RELATIONSHIP_TYPE_LABELS[member.relationship]} • Active
                      </span>
                    )}
                  </div>
                </div>
                {canEditRelationship(member) && editingMemberId !== member.userId && (
                  <button
                    type="button"
                    onClick={() => {
                      setMemberEditError(null);
                      setEditingMemberId(member.userId);
                    }}
                    aria-label={`Edit ${member.firstName}'s relationship`}
                    className="text-on-surface-variant hover:text-primary transition-colors shrink-0"
                  >
                    <Icon name="edit" className="text-[18px]" />
                  </button>
                )}
              </div>
            );
          })}
          {memberEditError && (
            <p className="font-body-sm text-body-sm text-error bg-error-container rounded-lg px-4 py-2">{memberEditError}</p>
          )}
          <Link
            to={`/onboarding/invite?childId=${childId}`}
            className="w-full py-4 rounded-xl bg-surface-container-lowest text-primary font-label-md text-label-md flex items-center justify-center gap-2 shadow-sm hover:bg-surface-container-low transition-colors"
          >
            <Icon name="person_add" />
            Invite Family
          </Link>
        </div>
      </div>
    </div>
  );
}

// Inline edit toggle for the fields PATCH /children/:childId accepts.
// Photo/avatar editing is out of scope (see the top-of-file note).
function ChildEditForm({
  childId,
  child,
  onCancel,
  onSaved,
}: {
  childId: string;
  child: ChildDetail;
  onCancel: () => void;
  onSaved: (updated: ChildDetail) => void;
}) {
  const [firstName, setFirstName] = useState(child.firstName);
  const [lastName, setLastName] = useState(child.lastName);
  const [gender, setGender] = useState<ChildGender>(child.gender);
  const [birthday, setBirthday] = useState(child.birthday.slice(0, 10));
  const [heightCm, setHeightCm] = useState(child.heightCm?.toString() ?? "");
  const [clothingSize, setClothingSize] = useState(child.clothingSize ?? "");
  const [shoeSize, setShoeSize] = useState(child.shoeSize ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPatch<ChildDetail>(`/children/${childId}`, {
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        gender,
        birthday: new Date(birthday).toISOString(),
        heightCm: heightCm ? Number(heightCm) : undefined,
        clothingSize: clothingSize.trim() || undefined,
        shoeSize: shoeSize.trim() || undefined,
      } satisfies UpdateChildRequest);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save those changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-3"
    >
      <div className="flex gap-3">
        <label className="flex-1 flex flex-col gap-1 font-label-md text-label-md text-text-main">
          First name
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="bg-surface-container rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </label>
        <label className="flex-1 flex flex-col gap-1 font-label-md text-label-md text-text-main">
          Last name
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="bg-surface-container rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 font-label-md text-label-md text-text-main">
        Gender
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value as ChildGender)}
          className="bg-surface-container rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="BOY">Boy</option>
          <option value="GIRL">Girl</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 font-label-md text-label-md text-text-main">
        Birthday
        <input
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          className="bg-surface-container rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </label>
      <label className="flex flex-col gap-1 font-label-md text-label-md text-text-main">
        Height (cm)
        <input
          type="number"
          step="0.1"
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
          className="bg-surface-container rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <div className="flex gap-3">
        <label className="flex-1 flex flex-col gap-1 font-label-md text-label-md text-text-main">
          Clothing size
          <input
            value={clothingSize}
            onChange={(e) => setClothingSize(e.target.value)}
            className="bg-surface-container rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="flex-1 flex flex-col gap-1 font-label-md text-label-md text-text-main">
          Shoe size
          <input
            value={shoeSize}
            onChange={(e) => setShoeSize(e.target.value)}
            className="bg-surface-container rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
      </div>
      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !firstName.trim()}
          className="flex-1 py-3 rounded-full bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
