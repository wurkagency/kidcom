import crypto from "node:crypto";

import { config } from "../config";
import { ApiError } from "../middleware/errorHandler";

// Google / Microsoft sign-in: OAuth 2.0 authorization-code flow with PKCE
// (S256) and a random state bound to the session. The profile is read from
// the provider's OIDC userinfo endpoint with the access token obtained over
// the direct back channel, so no ID-token parsing is needed.
//
// Trust rule for email: only Google's `email_verified` counts as proof that
// the person owns the address. Microsoft (Entra) lets tenant admins set any
// email claim ("nOAuth"), so a Microsoft email is never used to attach the
// identity to an existing account — only to prefill a new one, which then
// verifies its email like any signup.

export const OAUTH_PROVIDERS = ["google", "microsoft"] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: unknown): value is OAuthProviderId {
  return typeof value === "string" && (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

type ProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  clientId?: string;
  clientSecret?: string;
  extraAuthorizeParams?: Record<string, string>;
};

function providerConfig(provider: OAuthProviderId): ProviderConfig {
  if (provider === "google") {
    return {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      extraAuthorizeParams: { prompt: "select_account" },
    };
  }
  const tenant = encodeURIComponent(config.microsoftTenantId);
  return {
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    userinfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    clientId: config.microsoftClientId,
    clientSecret: config.microsoftClientSecret,
    extraAuthorizeParams: { prompt: "select_account" },
  };
}

export function isProviderConfigured(provider: OAuthProviderId): boolean {
  const { clientId, clientSecret } = providerConfig(provider);
  return Boolean(clientId && clientSecret);
}

export function redirectUri(provider: OAuthProviderId): string {
  return `${config.oauthRedirectBase.replace(/\/$/, "")}/auth/oauth/${provider}/callback`;
}

const base64url = (buf: Buffer) => buf.toString("base64url");

export function createPkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function createState(): string {
  return base64url(crypto.randomBytes(24));
}

export function authorizeUrl(provider: OAuthProviderId, state: string, codeChallenge: string): string {
  const p = providerConfig(provider);
  const url = new URL(p.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: p.clientId!,
    response_type: "code",
    redirect_uri: redirectUri(provider),
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    ...p.extraAuthorizeParams,
  }).toString();
  return url.toString();
}

export type OAuthProfile = {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
};

export async function fetchProfile(provider: OAuthProviderId, code: string, verifier: string): Promise<OAuthProfile> {
  const p = providerConfig(provider);
  const tokenRes = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(provider),
      client_id: p.clientId!,
      client_secret: p.clientSecret!,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) {
    // The provider's own reason (e.g. Microsoft's AADSTS code) goes to the
    // server log only; it never contains the secret.
    const detail = (await tokenRes.json().catch(() => ({}))) as { error?: string; error_description?: string };
    // eslint-disable-next-line no-console
    console.error(`OAuth ${provider} token exchange failed (${tokenRes.status}): ${detail.error ?? "?"} ${detail.error_description ?? ""}`.trim());
    throw new ApiError(502, `Sign-in with ${provider} failed at token exchange (${tokenRes.status})`);
  }
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
  if (!accessToken) throw new ApiError(502, `Sign-in with ${provider} returned no access token`);

  const infoRes = await fetch(p.userinfoUrl, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!infoRes.ok) {
    throw new ApiError(502, `Sign-in with ${provider} failed reading the profile (${infoRes.status})`);
  }
  const info = (await infoRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    given_name?: string;
    family_name?: string;
    name?: string;
  };
  if (!info.sub) throw new ApiError(502, `Sign-in with ${provider} returned no account id`);

  const [first = "", ...rest] = (info.name ?? "").trim().split(/\s+/);
  return {
    subject: info.sub,
    email: info.email?.trim().toLowerCase() || null,
    emailVerified: provider === "google" && (info.email_verified === true || info.email_verified === "true"),
    firstName: info.given_name?.trim() || first,
    lastName: info.family_name?.trim() || rest.join(" "),
  };
}
