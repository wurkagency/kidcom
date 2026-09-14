import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  RELATIONSHIP_TYPE_LABELS,
  relationshipTypeToRole,
  type CreateInviteRequest,
  type CreateInviteResponse,
  type RelationshipType,
} from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { OnboardingSegments } from "../components/OnboardingSegments";
import { apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Full spec §1.2 taxonomy (Phase 5) — grouped for the dropdown rather than
// alphabetical, since "which section is this in" is more useful here than
// strict ordering. FATHER/MOTHER/PARENT default to the top since a co-parent
// invite is the single most common case (spec §6.1's whole growth model).
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
  // BROTHER/SISTER deliberately excluded — spec 9.16 treats a sibling as a
  // parent-created minor account, not something invited by email like every
  // other row here (that flag/flow is Phase 10, but offering it as a normal
  // email invite now would be the wrong default in the meantime).
];

// Matches docs/stitch_splitkid/invite_co_parent/code.html. Delivery is
// stubbed for now (see apps/api/src/routes/invites — logs the accept link to
// the server console instead of emailing it) until a transactional provider
// is chosen alongside chunk 7's QuickPay billing work. Email-only — the
// phone/SMS option was removed: it never worked end to end (the accept
// endpoint always rejected phone-based invites, so the old "sent!" toast was
// misleading) and real SMS delivery is still a deferred, un-scoped feature.
//
// One invite UI for both flows: onboarding (no query params — defaults to
// the first child) and the child profile's "Invite Family" button
// (?childId=...). The relationship — Dad, Grandmother, etc. — is picked
// here rather than baked into which button was clicked; only relationships
// that resolve to PARENT (relationshipTypeToRole in packages/shared) grant
// full co-parent access, computed server-side so the client can't spoof it.
export function OnboardingInvitePage() {
  const navigate = useNavigate();
  const { children } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<RelationshipType>("PARENT");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // An explicit ?childId= means this was launched from that child's profile
  // rather than the onboarding flow (which relies on the default-to-first-
  // child fallback) — that's what decides where "Done"/"Skip" should return.
  const explicitChildId = searchParams.get("childId");
  const childId = explicitChildId ?? children[0]?.id;
  const childName =
    children.find((c) => c.id === childId)?.firstName ?? children[0]?.firstName ?? "your child";
  // No explicit childId means this really is the onboarding flow (as
  // opposed to being launched from a child profile's "Invite Family"
  // button) — in that case Done/Skip continue on to the next onboarding
  // step (Choose Your Plan) rather than dropping straight into the app.
  const returnPath = explicitChildId ? `/children/${explicitChildId}` : "/onboarding/plan";

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return;
    if (!childId) {
      setError("Add a child first before sending an invite.");
      return;
    }
    setSending(true);
    try {
      const res = await apiPost<CreateInviteResponse>("/invites", {
        childId,
        email,
        relationship,
      } satisfies CreateInviteRequest);
      setSent(true);
      setEmail("");
      // Email delivery is still stubbed to a server console log (see
      // mailSender.ts) — no real provider is wired up yet. Surfacing the
      // accept link here directly is what makes the invite loop testable at
      // all without shell access to that log: copy it, open it in another
      // browser/profile, done.
      setInviteLink(`${window.location.origin}/invite/${res.token}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  async function handleCopyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (permissions, non-HTTPS context);
      // the link is still shown selectable in the input below as a fallback.
    }
  }

  function handleDone() {
    navigate(returnPath);
  }

  return (
    <div className="flex flex-col w-full min-h-screen relative overflow-hidden bg-surface-beige">
      <OnboardingSegments step={3} total={4} label="Almost there" />

      <div className="flex-1 flex flex-col px-container-padding pb-safe relative z-10">
        <div className="flex justify-center items-center py-section-margin">
          <div className="w-40 h-40 rounded-full bg-secondary-container/50 flex items-center justify-center">
            <Icon name="favorite" className="text-6xl text-primary" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-4">
            {explicitChildId ? "Invite Family" : "Invite Co-parent"}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-[280px] mx-auto">
            Invite someone to see {childName}'s schedule and memories — a co-parent, grandparent, or
            anyone else who's part of {childName}'s life.
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSend} className="space-y-6 flex-1 flex flex-col justify-end pb-8">
            <div className="relative group">
              <label
                className="absolute -top-2 left-4 px-1 bg-surface-beige text-label-sm font-label-sm text-primary z-10"
                htmlFor="coparent-contact"
              >
                Email Address
              </label>
              <div className="relative flex items-center rounded-xl shadow-sm">
                <Icon name="person_add" className="text-outline pl-4 absolute left-0" />
                <input
                  id="coparent-contact"
                  className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md py-4 pl-12 pr-4 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  placeholder="e.g. alex@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="relative group">
              <label
                className="absolute -top-2 left-4 px-1 bg-surface-beige text-label-sm font-label-sm text-primary z-10"
                htmlFor="family-member-type"
              >
                Relationship
              </label>
              <div className="relative flex items-center rounded-xl shadow-sm">
                <Icon name="family_restroom" className="text-outline pl-4 absolute left-0" />
                <select
                  id="family-member-type"
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
              {relationshipTypeToRole(relationship) === "PARENT" && (
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 px-1">
                  A co-parent gets full access: custody schedule, swap requests, and everything else you
                  can do.
                </p>
              )}
              {relationshipTypeToRole(relationship) === "GUARDIAN" && (
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 px-1">
                  A guardian gets full access to {childName}'s record — custody schedule and medical
                  info included — but can't invite or remove a parent.
                </p>
              )}
            </div>

            {error && (
              <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-4 mt-8">
              <button
                type="submit"
                disabled={sending}
                className="w-full bg-primary text-on-primary py-4 rounded-full font-label-md text-label-md shadow-md active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[20px]">send</span>
                <span>{sending ? "Sending…" : "Send Invite"}</span>
              </button>
              <button
                type="button"
                onClick={() => navigate(returnPath)}
                className="w-full py-4 text-on-surface-variant font-label-md text-label-md rounded-full transition-colors flex items-center justify-center gap-2"
              >
                <span>Skip for now</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6 flex-1 flex flex-col justify-end pb-8">
            <div className="bg-primary-container text-on-primary-container p-4 rounded-lg shadow-sm flex items-center gap-3">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <span className="font-label-md text-label-md">Invitation created!</span>
            </div>

            {/* Real email delivery isn't wired up yet (see mailSender.ts) —
                this link is the actual, working invite. Share it directly
                (copy/paste, text, whatever) so the other person can accept
                it and this is fully testable without a mail provider. */}
            <div className="bg-surface-container-lowest rounded-xl p-4 space-y-3">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Email delivery isn't connected yet, so send this link to them yourself for now:
              </p>
              <input
                readOnly
                value={inviteLink ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full bg-surface-container text-on-surface font-body-sm text-body-sm py-3 px-4 rounded-lg outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full py-3 rounded-full bg-surface-container text-primary font-label-md text-label-md flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {copied ? "check" : "content_copy"}
                </span>
                <span>{copied ? "Copied!" : "Copy invite link"}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleDone}
              className="w-full bg-primary text-on-primary py-4 rounded-full font-label-md text-label-md shadow-md active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <span>Done</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
