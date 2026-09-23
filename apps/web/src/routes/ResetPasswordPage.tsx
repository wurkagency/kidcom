import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ResetPasswordRequest } from "@kidcom/shared";

import { AuthHero } from "../components/AuthHero";
import { FormInput } from "../components/FormInput";
import { Icon } from "../components/Icon";
import { apiPost, ApiRequestError } from "../lib/api";
import { passwordStrength } from "../lib/passwordStrength";

// The link ForgotPasswordPage's email points at (?token=). Matches Aura's
// mockup (docs/Themes/Aura/kidcom_reset_password) except for its "Sign out
// of all other devices" checkbox — this app's session model (Redis-backed
// express-session, see apps/api/src/middleware/session.ts) has no per-user
// session listing or bulk-revoke, so there's nothing real to wire that
// checkbox to. Left out rather than faked.
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const strength = useMemo(() => passwordStrength(password), [password]);

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
    if (password !== confirmPassword) {
      setError("Those passwords don't match");
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
      <AuthHero />
      <header className="px-container-padding py-6">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Set a new password</h1>
      </header>

      {done ? (
        <div className="flex-1 px-container-padding py-4">
          <p className="font-body-md text-body-md text-on-surface-variant">
            Your password has been reset. Taking you to log in…
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex-1 px-container-padding py-4 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
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
            {password.length > 0 && (
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
                <ul className="font-label-sm text-label-sm text-on-surface-variant flex flex-col gap-0.5">
                  <li className="flex items-center gap-1.5">
                    <Icon
                      name={password.length >= 8 ? "check_circle" : "radio_button_unchecked"}
                      className={`text-[14px] ${password.length >= 8 ? "text-primary" : ""}`}
                    />
                    At least 8 characters
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Icon
                      name={/[0-9]/.test(password) ? "check_circle" : "radio_button_unchecked"}
                      className={`text-[14px] ${/[0-9]/.test(password) ? "text-primary" : ""}`}
                    />
                    Includes a number
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Icon
                      name={/[^A-Za-z0-9]/.test(password) ? "check_circle" : "radio_button_unchecked"}
                      className={`text-[14px] ${/[^A-Za-z0-9]/.test(password) ? "text-primary" : ""}`}
                    />
                    Includes a symbol
                  </li>
                </ul>
              </div>
            )}
          </div>
          <FormInput
            id="confirmPassword"
            label="Confirm Password"
            icon="lock"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
              <span>{submitting ? "Saving…" : "Update Password"}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
