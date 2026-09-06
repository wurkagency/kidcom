import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { LoginRequest, MeResponse } from "@kidcom/shared";

import { FormInput } from "../components/FormInput";
import { apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// No Stitch mockup exists for a plain login screen (only the signup flow was
// designed) — built in the same visual language as SignupPage/FormInput.
export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Supports being linked to with ?redirect=/some/path (used by the invite
  // accept flow: "log in to accept this invite" sends the user back here).
  const redirect = searchParams.get("redirect");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost<MeResponse>("/auth/login", { email, password } satisfies LoginRequest);
      await refresh();
      navigate(redirect && redirect.startsWith("/") ? redirect : "/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface-beige text-text-main pb-safe">
      <header className="px-container-padding py-6">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-text-main">
          Welcome back
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Log in to continue.
        </p>
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
            <span>{submitting ? "Logging in…" : "Log In"}</span>
          </button>
          <p className="text-center font-body-md text-body-md text-on-surface-variant mt-6">
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
