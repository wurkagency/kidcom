import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MeResponse, SignupRequest } from "@kidcom/shared";

import { OnboardingProgress } from "../components/OnboardingProgress";
import { FormInput } from "../components/FormInput";
import { apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Matches docs/stitch_splitkid/create_your_account/code.html, except the
// mockup's single "Full Name" field is split into first/last name here
// since that's what the API (and the rest of the data model) expects.
export function SignupPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost<MeResponse>("/auth/signup", {
        email,
        password,
        firstName,
        lastName,
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
    <div className="flex flex-col w-full min-h-screen relative overflow-hidden bg-surface-beige text-text-main pb-safe">
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
            <span>{submitting ? "Creating account…" : "Create Account"}</span>
            {!submitting && (
              <span className="material-symbols-outlined text-on-primary">arrow_forward</span>
            )}
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
