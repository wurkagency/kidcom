import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { LoginRequest, TwoFactorRequiredResponse } from "@kidcom/shared";

import { AuthHero } from "../components/AuthHero";
import { FormInput } from "../components/FormInput";
import { Icon } from "../components/Icon";
import { apiPost, ApiRequestError } from "../lib/api";
import { safeRedirectPath } from "../lib/safeRedirect";

// Aura's mockup (docs/Themes/Aura/kidcom_login) shows a social sign-in row
// (Google/Microsoft) this app can't build honestly — there's no OAuth
// integration on the backend (no client ID/secret, no callback route), so
// wiring those buttons would either do nothing or lie about what they do.
// Left out rather than faked; see the audit notes for what real OAuth
// support would need.
//
// Logins always require 2FA (see apps/api/src/routes/auth/index.ts) — a
// correct password never grants a session by itself. On success this
// navigates to /login/verify (carrying ?redirect= through) rather than
// completing login itself; that screen is what calls refresh()/navigates on
// to the app once the emailed code is verified.
export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Supports being linked to with ?redirect=/some/path (used by the invite
  // accept flow: "log in to accept this invite" sends the user back here).
  // Validated via safeRedirectPath, not a raw startsWith("/") check — see
  // that file for why.
  const redirect = safeRedirectPath(searchParams.get("redirect"));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost<TwoFactorRequiredResponse>("/auth/login", {
        email,
        password,
        rememberMe,
      } satisfies LoginRequest);
      navigate(redirect ? `/login/verify?redirect=${encodeURIComponent(redirect)}` : "/login/verify");
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
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
          Log in
        </h1>
      </header>
      <form
        onSubmit={handleSubmit}
        className="flex-1 px-container-padding py-4 flex flex-col gap-6"
      >
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
          id="password"
          label="Password"
          icon="lock"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="flex items-center justify-between -mt-4">
          <label className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded accent-primary"
            />
            Remember me
          </label>
          <Link to="/forgot-password" className="font-label-sm text-label-sm text-primary">
            Forgot password?
          </Link>
        </div>
        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
            {error}
          </p>
        )}
        <div className="mt-auto pt-6 flex flex-col gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-on-primary font-title-md text-title-md py-4 rounded-full shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <span>{submitting ? "Signing in…" : "Sign In"}</span>
            {!submitting && <Icon name="arrow_forward" className="text-[18px]" />}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
            <Icon name="lock" className="text-[14px]" /> Secured &amp; encrypted
          </p>
          <p className="text-center font-body-md text-body-md text-on-surface-variant">
            New to KidCom?{" "}
            <Link className="text-primary font-label-md" to="/signup">
              Create an account
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
