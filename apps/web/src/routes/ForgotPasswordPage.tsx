import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { ForgotPasswordRequest } from "@kidcom/shared";

import { AuthHero } from "../components/AuthHero";
import { FormInput } from "../components/FormInput";
import { apiPost, ApiRequestError } from "../lib/api";

// Post-launch backlog Phase F — no Stitch mockup exists (same as LoginPage,
// which this matches visually). POST /auth/forgot-password always 204s
// regardless of whether the email exists, so this screen always shows the
// same "check your email" confirmation — never reveals whether an account
// exists for the address entered.
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost("/auth/forgot-password", { email } satisfies ForgotPasswordRequest);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface text-on-surface pb-safe">
      <AuthHero />
      <header className="px-container-padding py-6">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Reset your password</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Enter your email and we'll send you a link to reset it.
        </p>
      </header>

      {sent ? (
        <div className="flex-1 px-container-padding py-4 flex flex-col gap-6">
          <p className="font-body-md text-body-md text-on-surface-variant">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox.
          </p>
          <Link
            to="/login"
            className="w-full bg-primary text-on-primary font-label-md text-label-md py-4 rounded-full shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-auto"
          >
            Back to log in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex-1 px-container-padding py-4 flex flex-col gap-6">
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
          {error && (
            <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
          )}
          <div className="mt-auto pt-6">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-on-primary font-label-md text-label-md py-4 rounded-full shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <span>{submitting ? "Sending…" : "Send Reset Link"}</span>
            </button>
            <p className="text-center font-body-md text-body-md text-on-surface-variant mt-6">
              <Link className="text-primary font-label-md" to="/login">
                Back to log in
              </Link>
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
