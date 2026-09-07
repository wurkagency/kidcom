import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { MeResponse } from "@kidcom/shared";

import { apiGet, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Public route (reachable whether or not the visitor currently has a
// session, and NOT blocked by VerifyEmailGate itself) that the link in the
// verification email points at. GET rather than POST so it works as a plain
// clickable link with no client-side form.
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [status, setStatus] = useState<"checking" | "success" | "error">("checking");
  const [message, setMessage] = useState<string | null>(null);

  // react-router's useSearchParams() returns a NEW URLSearchParams object on
  // every render (not just on navigation) — depending on `searchParams`
  // itself, not this derived primitive, caused this effect to re-fire the
  // moment `refresh()` below triggered a re-render, resubmitting the
  // already-consumed (now-deleted) token and overwriting a real success
  // with a false "invalid or expired" error. Depending on the raw string
  // instead means the effect only re-runs if the token actually changes.
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing its token.");
      return;
    }
    apiGet<MeResponse>(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async () => {
        setStatus("success");
        await refresh();
        setTimeout(() => navigate("/"), 1500);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof ApiRequestError ? err.message : "Something went wrong");
      });
    // Only ever run once per token — see comment above on why this can't
    // depend on `searchParams` or `refresh`/`navigate` identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface-beige text-text-main items-center justify-center px-container-padding text-center gap-4">
      {status === "checking" && (
        <p className="font-body-md text-body-md text-on-surface-variant">Verifying…</p>
      )}
      {status === "success" && (
        <>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-text-main">
            Email verified
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Taking you into KidCom…
          </p>
        </>
      )}
      {status === "error" && (
        <>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-text-main">
            Link didn't work
          </h1>
          <p className="font-body-md text-body-md text-error">{message}</p>
          <Link
            to="/"
            className="font-label-md text-label-md text-primary underline mt-2"
          >
            Back to KidCom
          </Link>
        </>
      )}
    </div>
  );
}
