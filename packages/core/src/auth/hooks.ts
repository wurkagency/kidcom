import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ForgotPasswordRequest,
  LoginRequest,
  MeResponse,
  OAuthProviderId,
  PendingOAuthSignupResponse,
  PublicUser,
  ResetPasswordRequest,
  SignupRequest,
  TwoFactorRequiredResponse,
  UpdateProfileRequest,
} from "@kidcom/shared";

import { api, apiUrl } from "../api/client";
import { queryKeys } from "../api/queryClient";

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => (await api.get<MeResponse>("/auth/me")).user,
    staleTime: 5 * 60_000,
  });
}

/** Like useMe, for screens that are only reachable while signed in. */
export function useCurrentUser(): PublicUser {
  const { data } = useMe();
  if (!data) throw new Error("useCurrentUser used outside an authenticated route");
  return data;
}

function useSetMe() {
  const queryClient = useQueryClient();
  return (user: PublicUser | null) => queryClient.setQueryData(queryKeys.me, user);
}

/** Step 1 of sign-in: password check. Always answers "2FA code sent". */
export function useLogin() {
  return useMutation({
    mutationFn: (body: LoginRequest) => api.post<TwoFactorRequiredResponse>("/auth/login", body),
  });
}

/** Step 2 of sign-in: the emailed 6-digit code. Establishes the session. */
export function useVerifyTwoFactor() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (code: string) => api.post<MeResponse>("/auth/verify-2fa", { code }),
    onSuccess: ({ user }) => setMe(user),
  });
}

export function useResendTwoFactor() {
  return useMutation({ mutationFn: () => api.post<void>("/auth/resend-2fa") });
}

export function useCancelTwoFactor() {
  return useMutation({ mutationFn: () => api.post<void>("/auth/cancel-2fa") });
}

export function useSignup() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: SignupRequest) => api.post<MeResponse>("/auth/signup", body),
    onSuccess: ({ user }) => setMe(user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/auth/logout"),
    onSettled: () => {
      // Nothing cached for one account may survive into the next session.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, null);
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: ForgotPasswordRequest) => api.post<void>("/auth/forgot-password", body),
  });
}

/** Completes a reset (emailed token or SMS code) and signs the user in. */
export function useResetPassword() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: ResetPasswordRequest) => api.post<MeResponse>("/auth/reset-password", body),
    onSuccess: ({ user }) => setMe(user),
  });
}

/** Sends (or re-sends) the SMS code; pass a number to verify a new one. */
export function useSendPhoneCode() {
  return useMutation({
    mutationFn: (phone?: string) => api.post<void>("/auth/phone/send", phone ? { phone } : {}),
  });
}

export function useVerifyPhone() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (code: string) => api.post<MeResponse>("/auth/phone/verify", { code }),
    onSuccess: ({ user }) => setMe(user),
  });
}

/** First password for an account without one. */
export function useSetPassword() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (password: string) => api.post<MeResponse>("/auth/password", { password }),
    onSuccess: ({ user }) => setMe(user),
  });
}

/**
 * Full-page URL that starts Google/Microsoft sign-in (a navigation, not a
 * fetch — the provider's pages must load in the browser).
 */
export function oauthStartUrl(provider: OAuthProviderId, options: { next?: string; acceptedTerms?: boolean } = {}): string {
  const query = new URLSearchParams();
  if (options.next) query.set("next", options.next);
  if (options.acceptedTerms) query.set("acceptedTerms", "1");
  const qs = query.toString();
  return apiUrl(`/auth/oauth/${provider}/start${qs ? `?${qs}` : ""}`);
}

/** A Google/Microsoft identity waiting for consent on the signup screen. */
export function usePendingOAuthSignup(enabled: boolean) {
  return useQuery({
    queryKey: ["oauth-pending"],
    queryFn: async () => (await api.get<PendingOAuthSignupResponse>("/auth/oauth/pending")).pending,
    enabled,
    staleTime: Infinity,
  });
}

export function useCompleteOAuthSignup() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: () => api.post<MeResponse>("/auth/oauth/complete-signup", { acceptedTerms: true }),
    onSuccess: ({ user }) => setMe(user),
  });
}

/** Confirms an emailed verification link; the session's own user is refreshed. */
export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.get<MeResponse>(`/auth/verify-email?token=${encodeURIComponent(token)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useResendVerification() {
  return useMutation({ mutationFn: () => api.post<void>("/auth/resend-verification") });
}

export function useUpdateProfile() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => api.patch<MeResponse>("/auth/me", body),
    onSuccess: ({ user }) => setMe(user),
  });
}
