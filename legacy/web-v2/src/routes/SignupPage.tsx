import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MeResponse, SignupRequest } from "@kidcom/shared";

import { AuthHero } from "../components/AuthHero";
import { OnboardingProgress } from "../components/OnboardingProgress";
import { FormInput } from "../components/FormInput";
import { Icon } from "../components/Icon";
import { apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { passwordStrength } from "../lib/passwordStrength";

// Matches docs/Themes/Aura/kidcom_sign_up, with two intentional deviations:
// the mockup's single "Full Name" field is split into first/last name (what
// the API and data model expect), and there's no "I am the..." role picker
// or per-child selector here (spec §1.3, Phase 6) — that question moved to
// child-creation time (OnboardingChildPage), since it's a relationship to a
// specific child, not an account-wide attribute, and this app's real
// onboarding is already a separate multi-step flow (OnboardingProgress)
// rather than the mockup's single screen. Social sign-up (Google/Microsoft)
// is left out for the same reason LoginPage.tsx leaves it out — no real
// OAuth integration exists to wire it to.

export function SignupPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const strength = useMemo(() => passwordStrength(password), [password]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!acceptedTerms) {
      setError("You must accept the Terms & Privacy Policy to continue");
      return;
    }
    setSubmitting(true);
    try {
      await apiPost<MeResponse>("/auth/signup", {
        email,
        password,
        firstName,
        lastName,
        phone: phone.trim() || undefined,
        acceptedTerms,
      } satisfies SignupRequest);
      await refresh();
      navigate("/onboarding/child");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col w-full min-h-screen relative overflow-hidden bg-surface text-on-surface pb-safe">
      <AuthHero />
      <OnboardingProgress step={1} title="Welcome" subtitle="Let's set up your account." />
      <form
        onSubmit={handleSubmit}
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
        <FormInput
          id="email"
          label="Email Address"
          icon="mail"
          type="email"
          placeholder="jane@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormInput
          id="phone"
          label="Mobile Phone (optional)"
          icon="call"
          type="tel"
          placeholder="+45 12 34 56 78"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
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
          {password.length > 0 ? (
            <div className="flex flex-col gap-1 ml-1">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full ${
                      i < strength.score
                        ? strength.score <= 1
                          ? "bg-error"
                          : strength.score <= 2
                            ? "bg-secondary"
                            : "bg-primary"
                        : "bg-surface-container-high"
                    }`}
                  />
                ))}
              </div>
              <p className="font-label-sm text-label-sm text-on-surface-variant">{strength.label}</p>
            </div>
          ) : (
            <p className="font-label-sm text-label-sm text-on-surface-variant ml-1">
              Must be at least 8 characters long.
            </p>
          )}
        </div>
        <label className="flex items-start gap-2.5 font-label-sm text-label-sm text-on-surface-variant">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            required
            className="mt-0.5 w-4 h-4 rounded accent-primary shrink-0"
          />
          I agree to KidCom's Terms &amp; Conditions and Privacy Policy.
        </label>
        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
            {error}
          </p>
        )}
        <div className="mt-auto pt-6">
          <button
            type="submit"
            disabled={submitting || !acceptedTerms}
            className="w-full bg-primary text-on-primary font-label-md text-label-md py-4 rounded-full shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <span>{submitting ? "Creating account…" : "Create Account"}</span>
            {!submitting && <Icon name="arrow_forward" className="text-[18px]" />}
          </button>
          <p className="text-center font-body-md text-body-md text-on-surface-variant mt-6">
            Already have an account?{" "}
            <Link className="text-primary font-label-md" to="/login">
              Log in
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
