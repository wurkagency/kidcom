import { useState } from "react";

import { Icon } from "./Icon";
import { apiPost } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Full-screen gate shown instead of the app for any signed-in user whose
// account has no emailVerifiedAt yet — covers both organic signup and the
// invite-accept new-account path (both send the same verification email via
// apps/api/src/lib/emailVerification.ts). Nothing behind AppShell is
// reachable until the user clicks the link in that email, which lands on
// /verify-email (VerifyEmailPage) and calls GET /auth/verify-email.
export function VerifyEmailGate() {
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleResend() {
    setStatus("sending");
    try {
      await apiPost("/auth/resend-verification");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  async function handleLogout() {
    await apiPost("/auth/logout");
    await refresh();
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface-beige text-text-main items-center justify-center px-container-padding text-center gap-4">
      <Icon name="mark_email_unread" className="text-primary text-5xl" />
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-text-main">
        Verify your email
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-sm">
        We sent a confirmation link to <span className="font-label-md">{user?.email}</span>.
        Click it to finish setting up your KidCom account — this keeps your family's
        information private to people who actually own their email address.
      </p>

      {status === "sent" ? (
        <p className="font-body-md text-body-md text-primary">Email sent — check your inbox.</p>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          disabled={status === "sending"}
          className="bg-primary text-on-primary font-label-md text-label-md py-3 px-6 rounded-full shadow-md active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : "Resend email"}
        </button>
      )}
      {status === "error" && (
        <p className="font-body-md text-body-md text-error">
          Couldn't resend right now — try again in a moment.
        </p>
      )}

      <button
        type="button"
        onClick={handleLogout}
        className="font-label-md text-label-md text-on-surface-variant underline mt-4"
      >
        Log out
      </button>
    </div>
  );
}
