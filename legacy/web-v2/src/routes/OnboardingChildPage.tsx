import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  RELATIONSHIP_TYPE_LABELS,
  isParentShapedRelationship,
  type ChildGender,
  type CreateChildRequest,
  type CreateChildResponse,
  type RelationshipType,
} from "@kidcom/shared";

import { OnboardingProgress } from "../components/OnboardingProgress";
import { FormInput } from "../components/FormInput";
import { Icon } from "../components/Icon";
import { apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

const GENDERS: { value: ChildGender; label: string }[] = [
  { value: "BOY", label: "Boy" },
  { value: "GIRL", label: "Girl" },
  { value: "OTHER", label: "Other" },
];

// Full spec §1.2 taxonomy (Phase 9 — previously restricted to the three
// parent-shaped values here, back when the server only accepted those at
// child-creation time). Any non-parent-shaped choice now bootstraps a
// GUARDIAN grant instead (spec §1.4b) — see isParentShapedRelationship
// below. BROTHER/SISTER excluded, same reasoning as OnboardingInvitePage:
// spec 9.16 treats a sibling as a parent-created minor account, a Phase 10
// flow, not a relationship someone self-declares here.
const RELATIONSHIP_TYPE_OPTIONS: RelationshipType[] = [
  "FATHER",
  "MOTHER",
  "PARENT",
  "STEP_FATHER",
  "STEP_MOTHER",
  "FOSTER_FATHER",
  "FOSTER_MOTHER",
  "GUARDIAN",
  "GRANDFATHER_PAT",
  "GRANDFATHER_MAT",
  "GRANDMOTHER_PAT",
  "GRANDMOTHER_MAT",
  "UNCLE",
  "AUNT",
  "CAREGIVER",
  "OTHER",
];

// Matches docs/stitch_splitkid/tell_us_about_your_child/code.html. Photo
// upload from the mockup is deferred — media handling lands with the
// journal/media chunk, which is where file storage actually gets built.
//
// This same route/page is also the "Add new kid" destination from the Kids
// tab (ChildrenOverviewPage) for a user who already has at least one child —
// there's no separate route for that, so this component adapts: with
// existing children present it drops the onboarding stepper/copy and, on
// success, returns to the Kids list instead of continuing into the
// first-run "invite a co-parent" step (which an already-onboarded family
// has typically already been through).
export function OnboardingChildPage() {
  const navigate = useNavigate();
  const { refresh, children } = useAuth();
  const isAddingAnother = children.length > 0;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [gender, setGender] = useState<ChildGender>("BOY");
  const [relationship, setRelationship] = useState<RelationshipType>("PARENT");
  const [clothingSize, setClothingSize] = useState("");
  const [shoeSize, setShoeSize] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [wantsClaimLink, setWantsClaimLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set only when the creator bootstrap-grants (spec §2.2b) with no parent
  // email on file — there's nothing to auto-send, so the claim-link has to
  // be handed to them to share themselves, same pattern OnboardingInvitePage
  // uses for its own unsent-email fallback.
  const [claimLink, setClaimLink] = useState<string | null>(null);

  const isBootstrapGuardian = !isParentShapedRelationship(relationship);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiPost<CreateChildResponse>("/children", {
        firstName,
        lastName: lastName || undefined,
        gender,
        birthday,
        clothingSize: clothingSize || undefined,
        shoeSize: shoeSize || undefined,
        relationship,
        parentContact: isBootstrapGuardian
          ? {
              name: parentName,
              email: parentEmail || undefined,
              phone: parentPhone || undefined,
              wantsClaimLink: wantsClaimLink || undefined,
            }
          : undefined,
      } satisfies CreateChildRequest);
      await refresh();

      if (res.parentInvite && !res.parentInvite.emailSent) {
        setClaimLink(`${window.location.origin}/invite/${res.parentInvite.token}`);
        return;
      }
      navigate(isAddingAnother ? "/kids" : "/onboarding/invite");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyLink() {
    if (!claimLink) return;
    try {
      await navigator.clipboard.writeText(claimLink);
    } catch {
      // Clipboard API can be unavailable (permissions, non-HTTPS context);
      // the link is still shown selectable in the input below as a fallback.
    }
  }

  if (claimLink) {
    return (
      <div className="flex flex-col w-full min-h-screen bg-surface text-on-surface pb-safe px-container-padding py-6">
        <div className="flex-1 flex flex-col justify-center gap-6">
          <div className="bg-primary-container text-on-primary-container p-4 rounded-lg shadow-sm flex items-center gap-3">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
            <span className="font-label-md text-label-md">{firstName} was added!</span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Send this link to {parentName || "their parent"} so they can accept — it starts a 30-day
            free trial for them too.
          </p>
          <div className="bg-surface-container-lowest rounded-xl p-4 space-y-3">
            <input
              readOnly
              value={claimLink}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full bg-surface-container text-on-surface font-body-sm text-body-sm py-3 px-4 rounded-lg outline-none"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-3 rounded-full bg-surface-container text-primary font-label-md text-label-md flex items-center justify-center gap-2"
            >
              <Icon name="content_copy" className="text-[18px]" />
              <span>Copy link</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate(isAddingAnother ? "/kids" : "/onboarding/invite")}
          className="w-full py-4 bg-primary text-on-primary rounded-full font-label-md text-label-md shadow-md active:scale-[0.98] transition-transform flex items-center justify-center gap-2 mt-6"
        >
          <span>Done</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface text-on-surface pb-safe">
      {isAddingAnother ? (
        <div className="px-container-padding pt-6 pb-2">
          <h1 className="font-display-lg text-display-lg text-on-surface">Add new kid</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Adding their details helps personalize their journal and keep their sizes handy for everyone.
          </p>
        </div>
      ) : (
        <OnboardingProgress
          step={2}
          title="Let's meet your child"
          subtitle="Adding their details helps personalize their journal and keep their sizes handy for everyone."
        />
      )}
      <form onSubmit={handleSubmit} className="flex-1 px-container-padding py-4 flex flex-col gap-6">
        <div className="flex flex-col items-center justify-center gap-4 py-6">
          <div className="w-32 h-32 rounded-full bg-surface-container-high flex items-center justify-center shadow-sm">
            <Icon name="add_a_photo" className="text-4xl text-on-surface-variant" />
          </div>
          <span className="font-label-md text-label-md text-on-surface-variant">
            Photo upload comes in a later chunk
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            id="first-name"
            label="First Name"
            placeholder="E.g. Leo"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <FormInput
            id="last-name"
            label="Last Name"
            placeholder="Optional"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>

        <FormInput
          id="birthday"
          label="Birthday"
          icon="calendar_month"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          required
        />

        <div className="flex flex-col gap-1.5">
          <label className="font-label-md text-label-md text-on-surface" id="gender-label">
            Gender (Optional)
          </label>
          <div
            className="flex p-1 bg-surface-container-high rounded-xl gap-1"
            role="group"
            aria-labelledby="gender-label"
          >
            {GENDERS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGender(g.value)}
                className={`flex-1 py-2 font-label-md text-label-md rounded-lg transition-colors text-center ${
                  gender === g.value
                    ? "bg-surface-container-lowest text-on-surface shadow-sm"
                    : "text-on-surface-variant"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative group">
          <label
            className="absolute -top-2 left-4 px-1 bg-surface text-label-sm font-label-sm text-primary z-10"
            htmlFor="relationship"
          >
            I am this child's…
          </label>
          <div className="relative flex items-center rounded-xl shadow-sm">
            <Icon name="family_restroom" className="text-outline pl-4 absolute left-0" />
            <select
              id="relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as RelationshipType)}
              className="w-full appearance-none bg-surface-container-lowest text-on-surface font-body-md text-body-md py-4 pl-12 pr-10 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            >
              {RELATIONSHIP_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {RELATIONSHIP_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <Icon name="expand_more" className="text-outline pr-4 absolute right-0" />
          </div>
          {isBootstrapGuardian ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 px-1">
              You'll get full access to help out — but since you're not {firstName || "this child"}'s
              parent, we'll ask you to add their parent below so they're always in the loop.
            </p>
          ) : (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 px-1">
              You'll get full parent access: custody schedule, swap requests, and everything else in the
              app.
            </p>
          )}
        </div>

        {isBootstrapGuardian && (
          <div className="bg-surface-container rounded-lg p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container shrink-0">
                <Icon name="family_restroom" className="text-sm" />
              </div>
              <div>
                <h3 className="font-label-md text-label-md text-on-surface">
                  {firstName || "This child"}'s parent
                </h3>
                <p className="text-sm text-on-surface-variant leading-tight">
                  Every child on KidCom has a parent — we'll invite them right away.
                </p>
              </div>
            </div>
            <FormInput
              id="parent-name"
              label="Parent's name"
              placeholder="E.g. Sam"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              required
            />
            {!wantsClaimLink && (
              <>
                <FormInput
                  id="parent-email"
                  label="Parent's email"
                  type="email"
                  placeholder="e.g. sam@example.com"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                />
                <FormInput
                  id="parent-phone"
                  label="Parent's phone (optional)"
                  type="tel"
                  placeholder="Optional"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                />
              </>
            )}
            <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
              <input
                type="checkbox"
                checked={wantsClaimLink}
                onChange={(e) => setWantsClaimLink(e.target.checked)}
                className="rounded"
              />
              I'll share a link with them myself instead
            </label>
          </div>
        )}

        <div className="bg-surface-container rounded-lg p-5 shadow-sm mt-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container shrink-0">
              <Icon name="checkroom" className="text-sm" />
            </div>
            <div>
              <h3 className="font-label-md text-label-md text-on-surface">Current Sizes</h3>
              <p className="text-sm text-on-surface-variant leading-tight">
                Helpful for grandparents &amp; co-parents
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              id="clothing-size"
              label="Clothing"
              placeholder="E.g. 4T"
              value={clothingSize}
              onChange={(e) => setClothingSize(e.target.value)}
            />
            <FormInput
              id="shoe-size"
              label="Shoe Size"
              placeholder="E.g. 10C"
              value={shoeSize}
              onChange={(e) => setShoeSize(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 mt-auto pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-primary text-on-primary rounded-full font-label-md text-label-md shadow-md active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <span>{submitting ? "Saving…" : isAddingAnother ? "Save" : "Save & Continue"}</span>
            {!submitting && <span className="material-symbols-outlined text-lg">arrow_forward</span>}
          </button>
          <button
            type="button"
            onClick={() => navigate(isAddingAnother ? "/kids" : "/")}
            className="w-full py-3 text-on-surface-variant font-label-md text-label-md hover:text-on-surface transition-colors text-center"
          >
            {isAddingAnother ? "Cancel" : "I'll add this later"}
          </button>
        </div>
      </form>
    </div>
  );
}
