import { useState, useEffect, useRef, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { MeResponse, VerifyTwoFactorRequest } from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { safeRedirectPath } from "../lib/safeRedirect";

const RESEND_COOLDOWN_S = 30;

// No Stitch mockup exists for this in-app screen (only the
// transactional_email_login_2fa_verification email was designed) — same
// precedent as LoginPage.tsx having no mockup either. Built in the same
// visual language. Reached only right after POST /auth/login succeeds, which
// parks the login as "pending" (session.pendingTwoFactorUserId) rather than
// granting a session — this screen's job is to submit the emailed 6-digit
// code to POST /auth/verify-2fa to actually complete login.
export function LoginTwoFactorPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Validated via safeRedirectPath, not a raw startsWith("/") check — see
  // that file for why.
  const redirect = safeRedirectPath(searchParams.get("redirect"));

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_S);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost<MeResponse>("/auth/verify-2fa", { code } satisfies VerifyTwoFactorRequest);
      await refresh();
      navigate(redirect ?? "/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setResending(true);
    setError(null);
    try {
      await apiPost("/auth/resend-2fa");
      startCooldown();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't resend the code — try again");
    } finally {
      setResending(false);
    }
  }

  async function handleUseDifferentAccount() {
    try {
      await apiPost("/auth/cancel-2fa");
    } catch {
      // Best-effort — navigate back to /login regardless.
    }
    navigate("/login");
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface text-on-surface pb-safe">
      <header className="px-container-padding py-6">
        <div className="w-12 h-12 rounded-full bg-primary-container/20 text-primary flex items-center justify-center mb-4">
          <Icon name="lock" />
        </div>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
          Enter verification code
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          We sent a 6-digit code to your email. It's valid for 10 minutes.
        </p>
      </header>
      <form onSubmit={handleSubmit} className="flex-1 px-container-padding py-4 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="font-label-md text-label-md text-on-surface ml-1" htmlFor="two-factor-code">
            Verification Code
          </label>
          <input
            id="two-factor-code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            className="w-full bg-surface-container-lowest text-on-surface font-mono text-center text-2xl tracking-[0.5em] py-4 rounded-xl outline-none transition-all focus:ring-2 focus:ring-primary shadow-sm"
          />
        </div>
        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
        )}
        <div className="mt-auto pt-6 flex flex-col gap-4">
          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="w-full bg-primary text-on-primary font-label-md text-label-md py-4 rounded-full shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? "Verifying…" : "Verify & Continue"}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="text-center font-label-md text-label-md text-primary disabled:opacity-60"
          >
            {cooldown > 0 ? `Resend code (${cooldown}s)` : resending ? "Sending…" : "Resend code"}
          </button>
          <button
            type="button"
            onClick={handleUseDifferentAccount}
            className="text-center font-body-md text-body-md text-on-surface-variant"
          >
            Not you? Use a different account
          </button>
        </div>
      </form>
    </div>
  );
}
