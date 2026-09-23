import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ForgotPasswordRequest,
  LoginRequest,
  MeResponse,
  PublicUser,
  ResetPasswordRequest,
  SignupRequest,
  TwoFactorRequiredResponse,
  UpdateProfileRequest,
} from "@kidcom/shared";

import { api } from "../api/client";
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

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordRequest) => api.post<void>("/auth/reset-password", body),
  });
}

export function useVerifyEmail() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (token: string) => api.get<MeResponse>(`/auth/verify-email?token=${encodeURIComponent(token)}`),
    onSuccess: ({ user }) => setMe(user),
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
