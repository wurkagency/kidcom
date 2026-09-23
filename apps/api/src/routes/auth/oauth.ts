import { Router, type Request, type Response } from "express";
import type { CompleteOAuthSignupRequest, MeResponse, PendingOAuthSignupResponse } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { createAccount } from "../../lib/accounts";
import { sendVerificationEmail } from "../../lib/emailVerification";
import { loadPublicUser } from "../../lib/publicUser";
import { establishSession } from "../../lib/sessions";
import {
  authorizeUrl,
  createPkce,
  createState,
  fetchProfile,
  isOAuthProvider,
  isProviderConfigured,
  type OAuthProfile,
  type OAuthProviderId,
} from "../../lib/oauth";

// Google / Microsoft sign-in (lib/oauth.ts has the protocol and the email
// trust rule). The browser reaches these through the web origin + "/api"
// (Vite proxy in dev, path routing in production), so every redirect below
// is a same-origin relative path into the web app.
export const oauthRouter = Router();

const dbProvider = (p: OAuthProviderId): "GOOGLE" | "MICROSOFT" => (p === "google" ? "GOOGLE" : "MICROSOFT");

/** Only same-app relative paths are accepted as a post-sign-in target. */
function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : "/";
}

function fail(res: Response, reason: string) {
  res.redirect(302, `/login?oauthError=${encodeURIComponent(reason)}`);
}

async function createOAuthAccount(req: Request, provider: OAuthProviderId, profile: OAuthProfile & { email: string }) {
  const user = await createAccount({
    email: profile.email,
    firstName: profile.firstName || profile.email.split("@")[0],
    lastName: profile.lastName,
    emailVerified: profile.emailVerified,
    oauth: { provider: dbProvider(provider), providerUserId: profile.subject, email: profile.email },
  });
  if (!profile.emailVerified) {
    await sendVerificationEmail(user).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`Failed to send verification email to ${user.email}:`, err);
    });
  }
  await establishSession(req, user.id);
  return user;
}

// Step 1 — redirect to the provider. `acceptedTerms=1` comes from the signup
// screen (its consent boxes are ticked before the provider buttons enable),
// letting a brand-new identity become an account without a second stop.
oauthRouter.get("/:provider/start", async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!isOAuthProvider(provider)) throw new ApiError(404, "Unknown sign-in provider");
    if (!isProviderConfigured(provider)) {
      fail(res, "unavailable");
      return;
    }
    const state = createState();
    const { verifier, challenge } = createPkce();
    req.session.oauth = {
      provider,
      state,
      verifier,
      next: safeNext(req.query.next),
      acceptedTerms: req.query.acceptedTerms === "1",
    };
    req.session.save((err) => {
      if (err) {
        next(err);
        return;
      }
      res.redirect(302, authorizeUrl(provider, state, challenge));
    });
  } catch (err) {
    next(err);
  }
});

// Step 2 — the provider sends the browser back here.
oauthRouter.get("/:provider/callback", async (req, res, next) => {
  try {
    const { provider } = req.params;
    const pending = req.session.oauth;
    delete req.session.oauth;

    if (!isOAuthProvider(provider) || !pending || pending.provider !== provider) {
      fail(res, "expired");
      return;
    }
    if (typeof req.query.state !== "string" || req.query.state !== pending.state) {
      fail(res, "expired");
      return;
    }
    if (req.query.error || typeof req.query.code !== "string") {
      fail(res, "cancelled");
      return;
    }

    const profile = await fetchProfile(provider, req.query.code, pending.verifier);

    // 1. A known identity → sign in.
    const linked = await prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: dbProvider(provider), providerUserId: profile.subject } },
    });
    if (linked) {
      await establishSession(req, linked.userId);
      res.redirect(302, pending.next);
      return;
    }

    // 2. Already signed in → connect this identity to the current account.
    if (req.session.userId) {
      await prisma.oAuthAccount.create({
        data: { userId: req.session.userId, provider: dbProvider(provider), providerUserId: profile.subject, email: profile.email },
      });
      res.redirect(302, pending.next);
      return;
    }

    if (!profile.email) {
      fail(res, "no_email");
      return;
    }
    const email = profile.email;

    // 3. An existing account with this email. Attach only when the provider
    //    vouches for the address (Google email_verified); otherwise the person
    //    must sign in with their password first and connect from settings.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (!profile.emailVerified) {
        fail(res, "account_exists");
        return;
      }
      await prisma.oAuthAccount.create({
        data: { userId: existing.id, provider: dbProvider(provider), providerUserId: profile.subject, email },
      });
      await establishSession(req, existing.id);
      res.redirect(302, pending.next);
      return;
    }

    // 4. A new person. With consent already given on the signup screen,
    //    create the account now; otherwise ask for it first.
    if (pending.acceptedTerms) {
      await createOAuthAccount(req, provider, { ...profile, email });
      res.redirect(302, "/");
      return;
    }
    req.session.pendingOAuthSignup = { provider, ...profile, email };
    req.session.save(() => res.redirect(302, "/signup?continue=oauth"));
  } catch (err) {
    next(err);
  }
});

// The signup screen's "continue with Google/Microsoft" state.
oauthRouter.get("/pending", (req, res) => {
  const p = req.session.pendingOAuthSignup;
  const body: PendingOAuthSignupResponse = {
    pending: p ? { provider: p.provider, email: p.email, firstName: p.firstName, lastName: p.lastName } : null,
  };
  res.json(body);
});

oauthRouter.post("/complete-signup", async (req, res, next) => {
  try {
    const p = req.session.pendingOAuthSignup;
    if (!p) throw new ApiError(400, "Your sign-in session expired — please try again");
    if ((req.body as Partial<CompleteOAuthSignupRequest>).acceptedTerms !== true) {
      throw new ApiError(400, "You must accept the Privacy Policy and Terms to continue");
    }
    if (await prisma.user.findUnique({ where: { email: p.email } })) {
      throw new ApiError(409, "An account with this email already exists");
    }
    const user = await createOAuthAccount(req, p.provider, p);
    res.status(201).json({ user: await loadPublicUser(user.id) } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
});
