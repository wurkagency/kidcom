import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { MeResponse } from "@kidcom/shared";

import { apiGet, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Module-level, not component state: App.tsx maps "/verify-email" to this
// component in TWO separate route trees (the unverified-gate branch and the
// authenticated branch — see App.tsx). The instant this component's own
// verify call succeeds and calls refresh(), the auth context updates,
// App re-renders, and the top-level branch it takes flips from one of
// those trees to the other — which fully unmounts and remounts this
// component, re-running its effect from scratch regardless of any
// dependency array. A dependency-array fix cannot prevent a remount; only
// state that survives the remount can. A plain module-level Set does,
// since it lives for the page's lifetime, not the component instance's.
const consumedTokens = new Set<string>();

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

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing its token.");
      return;
    }
    if (consumedTokens.has(token)) {
      // Already handled this exact token in this page load (remount from
      // the App.tsx branch switch, or a churned searchParams identity) —
      // re-submitting it would 400 against an already-deleted token and
      // stomp the real success with a false error. Nothing to do: the
      // first pass already set status to success and is navigating away.
      return;
    }
    consumedTokens.add(token);
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
    // Only ever run once per token — see the consumedTokens comment above
    // for why this can't depend on `searchParams`, `refresh`, or `navigate`
    // identity, and can't rely on the dependency array alone either.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface text-on-surface items-center justify-center px-container-padding text-center gap-4">
      {status === "checking" && (
        <p className="font-body-md text-body-md text-on-surface-variant">Verifying…</p>
      )}
      {status === "success" && (
        <>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            Email verified
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Taking you into KidCom…
          </p>
        </>
      )}
      {status === "error" && (
        <>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
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
