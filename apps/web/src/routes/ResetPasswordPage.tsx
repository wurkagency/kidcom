import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ResetPasswordRequest } from "@kidcom/shared";

import { FormInput } from "../components/FormInput";
import { apiPost, ApiRequestError } from "../lib/api";

// Post-launch backlog Phase F — the link ForgotPasswordPage's email points
// at (?token=). Same visual language as LoginPage/ForgotPasswordPage.
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("This reset link is missing its token — request a new one.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    setSubmitting(true);
    try {
      await apiPost("/auth/reset-password", { token, password } satisfies ResetPasswordRequest);
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col w-full min-h-screen bg-surface text-on-surface pb-safe px-container-padding py-6">
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
          This reset link is invalid or missing its token.
        </p>
        <Link to="/forgot-password" className="mt-4 font-label-md text-label-md text-primary">
          Request a new one
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface text-on-surface pb-safe">
      <header className="px-container-padding py-6">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Choose a new password</h1>
      </header>

      {done ? (
        <div className="flex-1 px-container-padding py-4">
          <p className="font-body-md text-body-md text-on-surface-variant">
            Your password has been reset. Taking you to log in…
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex-1 px-container-padding py-4 flex flex-col gap-6">
          <FormInput
            id="password"
            label="New Password"
            icon="lock"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
              <span>{submitting ? "Saving…" : "Reset Password"}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
