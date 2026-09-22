import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { RELATIONSHIP_TYPE_LABELS, type AcceptInviteRequest, type InvitePreviewResponse, type MeResponse } from "@kidcom/shared";

import { FormInput } from "../components/FormInput";
import { apiFetch, apiGet, apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Rewritten to check the invite's actual state before rendering anything
// (see GET /invites/:token) instead of only finding out on submit, and to
// handle every combination of "logged in or not" x "account already exists
// for this email or not" — previously a logged-in user could never open
// this page at all (App.tsx bounced it to "/"), and an unauthenticated
// submit for an email that already had an account silently logged the
// submitter in as that account with no password check (a real
// account-takeover bug, now fixed on the backend).
export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();

  const [preview, setPreview] = useState<InvitePreviewResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiGet<InvitePreviewResponse>(`/invites/${token}`)
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleCreateAccount(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost<MeResponse>(`/invites/${token}/accept`, {
        firstName,
        lastName,
        password,
      } satisfies AcceptInviteRequest);
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't accept this invite");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptAsMe() {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost<MeResponse>(`/invites/${token}/accept-as-me`);
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't accept this invite");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setSubmitting(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function Shell({ children }: { children: React.ReactNode }) {
    return (
      <div className="flex flex-col w-full min-h-screen relative overflow-hidden bg-surface text-on-surface pb-safe">
        {children}
      </div>
    );
  }

  if (!preview && !loadError) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center">
          <p className="font-body-md text-body-md text-on-surface-variant">Loading invite…</p>
        </div>
      </Shell>
    );
  }

  if (loadError || !preview || !preview.valid) {
    const message =
      preview?.reason === "already_accepted"
        ? "This invite has already been accepted."
        : "This invite link is invalid or has expired.";
    return (
      <Shell>
        <div className="px-container-padding pt-10 pb-4">
          <h1 className="font-headline-lg text-headline-lg text-primary">Invite not available</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2">{message}</p>
        </div>
        <div className="px-container-padding mt-4">
          <Link
            to={user ? "/" : "/welcome"}
            className="inline-block bg-primary text-on-primary font-label-md text-label-md py-3 px-6 rounded-full"
          >
            {user ? "Go to Dashboard" : "Go to KidCom"}
          </Link>
        </div>
      </Shell>
    );
  }

  // Logged in, but as someone whose email doesn't match the invite.
  if (user && preview.email && user.email.toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <Shell>
        <div className="px-container-padding pt-10 pb-4">
          <h1 className="font-headline-lg text-headline-lg text-primary">Wrong account</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2">
            This invite was sent to <strong>{preview.email}</strong>, but you're logged in as{" "}
            {user.email}. Log out to accept it with the right account.
          </p>
        </div>
        <div className="px-container-padding mt-4">
          <button
            onClick={handleLogout}
            disabled={submitting}
            className="bg-primary text-on-primary font-label-md text-label-md py-3 px-6 rounded-full disabled:opacity-60"
          >
            Log out
          </button>
        </div>
      </Shell>
    );
  }

  // Logged in as the matching email — one-tap accept, no form needed.
  if (user && preview.userExists) {
    return (
      <Shell>
        <div className="px-container-padding pt-10 pb-4">
          <h1 className="font-headline-lg text-headline-lg text-primary">You're invited to KidCom</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2">
            {preview.inviterName ?? "Someone"} invited you to
            {preview.childName ? ` ${preview.childName}'s` : " their child's"} KidCom — accept to
            get access with your existing account ({user.email}).
          </p>
        </div>
        {error && (
          <p className="mx-container-padding font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
            {error}
          </p>
        )}
        <div className="px-container-padding mt-4">
          <button
            onClick={handleAcceptAsMe}
            disabled={submitting}
            className="w-full bg-primary text-on-primary font-label-md text-label-md py-4 rounded-full shadow-md active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {submitting ? "Accepting…" : "Accept invite"}
          </button>
        </div>
      </Shell>
    );
  }

  // Not logged in, and an account already exists for this email — need to
  // log in first rather than creating a duplicate/incorrect account.
  if (!user && preview.userExists) {
    return (
      <Shell>
        <div className="px-container-padding pt-10 pb-4">
          <h1 className="font-headline-lg text-headline-lg text-primary">You're invited to KidCom</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2">
            You already have an account for {preview.email}. Log in to accept this invite.
          </p>
        </div>
        <div className="px-container-padding mt-4">
          <Link
            to={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
            className="inline-block bg-primary text-on-primary font-label-md text-label-md py-3 px-6 rounded-full"
          >
            Log in
          </Link>
        </div>
      </Shell>
    );
  }

  // No account exists yet for this email — create one (unchanged from
  // before, just gated behind the preview check now).
  return (
    <Shell>
      <div className="px-container-padding pt-10 pb-4">
        <h1 className="font-headline-lg text-headline-lg text-primary">You're invited to KidCom</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-2">
          Create your account to accept
          {preview.relationship ? ` as ${RELATIONSHIP_TYPE_LABELS[preview.relationship]}` : ""} — you'll get a
          30-day free trial.
        </p>
      </div>
      <form
        onSubmit={handleCreateAccount}
        className="flex-1 px-container-padding py-4 flex flex-col gap-6 relative z-10"
      >
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            id="firstName"
            label="First Name"
            icon="person"
            placeholder="Jane"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <FormInput
            id="lastName"
            label="Last Name"
            placeholder="Doe"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <FormInput
            id="password"
            label="Password"
            icon="lock"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <p className="font-label-sm text-label-sm text-on-surface-variant ml-1">
            Must be at least 8 characters long.
          </p>
        </div>
        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
            {error}
          </p>
        )}
        <div className="mt-auto pt-6">
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-on-primary font-label-md text-label-md py-4 rounded-full shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? "Joining…" : "Accept invite"}
          </button>
        </div>
      </form>
    </Shell>
  );
}
