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

  useEffect(() => {
    const token = searchParams.get("token");
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
    // Only ever run once per mount — re-running on `refresh` identity churn
    // would re-submit an already-consumed (now invalid) token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
