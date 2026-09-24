import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BillingPlansResponse,
  InvitePreviewResponse,
  AcceptInviteRequest,
  MeResponse,
  NotificationPreferencesDto,
  SubscribeRequest,
  SubscribeResponse,
  SubscriptionDto,
  UpdateNotificationPreferencesRequest,
  VapidPublicKeyResponse,
} from "@kidcom/shared";

import { api, apiUrl } from "../api/client";
import { queryKeys } from "../api/queryClient";

// Account, security, notification preferences, push, billing and invites —
// the profile-menu areas.

const enc = encodeURIComponent;

// ---- Security --------------------------------------------------------------

export function useChangePassword() {
  return useMutation({
    mutationFn: (v: { currentPassword: string; newPassword: string }) => api.post<void>("/auth/change-password", v),
  });
}

export function useOtherSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: async () => (await api.get<{ otherSessions: number }>("/auth/sessions")).otherSessions,
  });
}

export function useSignOutOtherDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ revoked: number }>("/auth/sessions/revoke-others"),
    onSuccess: () => qc.setQueryData(["sessions"], 0),
  });
}

/** Everything the account holds, as a JSON download (GDPR access). */
export const accountExportUrl = () => apiUrl("/auth/export");

/** Deletes the account; the shared family history stays under "Former member". Clears all cached data. */
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>("/auth/me", { confirm: true }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(queryKeys.me, null);
    },
  });
}

// ---- Notifications + push -------------------------------------------------

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.get<NotificationPreferencesDto>("/notification-preferences"),
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateNotificationPreferencesRequest) => api.patch<NotificationPreferencesDto>("/notification-preferences", body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ["notification-preferences"] });
      const prev = qc.getQueryData<NotificationPreferencesDto>(["notification-preferences"]);
      if (prev) qc.setQueryData(["notification-preferences"], { ...prev, ...body });
      return { prev };
    },
    onError: (_e, _b, ctx) => ctx?.prev && qc.setQueryData(["notification-preferences"], ctx.prev),
    onSuccess: (fresh) => qc.setQueryData(["notification-preferences"], fresh),
  });
}

export type PushState = "unsupported" | "denied" | "off" | "on";

const urlBase64ToUint8Array = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Push on this device: its state, and turning it on (asks permission) or off. */
export function usePush() {
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [state, setState] = useState<PushState>(() => (!supported ? "unsupported" : Notification.permission === "denied" ? "denied" : "off"));
  const [busy, setBusy] = useState(false);

  // Is this device already subscribed?
  useEffect(() => {
    if (!supported || Notification.permission === "denied") return;
    let live = true;
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => live && sub && setState("on"));
    return () => {
      live = false;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await api.get<VapidPublicKeyResponse>("/push/vapid-public-key");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const json = sub.toJSON();
      await api.post("/push/subscribe", { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } });
      setState("on");
    } finally {
      setBusy(false);
    }
  }, [supported]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.delete(`/push/subscribe?endpoint=${enc(sub.endpoint)}`);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable };
}

// ---- Billing -------------------------------------------------------------

export function useBillingStatus() {
  return useQuery({ queryKey: ["billing"], queryFn: () => api.get<SubscriptionDto>("/billing/status") });
}

export function useBillingPlans() {
  return useQuery({ queryKey: ["billing-plans"], queryFn: () => api.get<BillingPlansResponse>("/billing/plans"), staleTime: 60 * 60_000 });
}

/** Starts a plan. A paid plan returns QuickPay's payment page to go to; Free (or dev without keys) switches at once. */
export function useSubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SubscribeRequest) => api.post<SubscribeResponse>("/billing/subscribe", body),
    onSuccess: ({ redirectUrl }) => {
      if (redirectUrl) window.location.assign(redirectUrl);
      else void qc.invalidateQueries({ queryKey: ["billing"] });
    },
  });
}

/** Back from the payment page: charge the first period and switch the plan on. */
export function useConfirmCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SubscriptionDto>("/billing/confirm"),
    onSuccess: (sub) => {
      qc.setQueryData(["billing"], sub);
      void qc.invalidateQueries({ queryKey: queryKeys.children });
    },
    // A declined card puts the plan back on Free: show that.
    onError: () => void qc.invalidateQueries({ queryKey: ["billing"] }),
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SubscriptionDto>("/billing/cancel"),
    onSuccess: (sub) => qc.setQueryData(["billing"], sub),
  });
}

// ---- Invites -------------------------------------------------------------

export function useInvitePreview(token: string | undefined) {
  return useQuery({
    queryKey: ["invite", token],
    queryFn: () => api.get<InvitePreviewResponse>(`/invites/${enc(token!)}`),
    enabled: Boolean(token),
  });
}

/** A new account from the invite (signs in; phone verification follows). */
export function useAcceptInvite(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AcceptInviteRequest) => api.post<MeResponse>(`/invites/${enc(token)}/accept`, body),
    onSuccess: ({ user }) => {
      qc.setQueryData(queryKeys.me, user);
      void qc.invalidateQueries({ queryKey: queryKeys.children });
    },
  });
}

/** Signed in already: add the invite's child to this account. */
export function useAcceptInviteAsMe(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<unknown>(`/invites/${enc(token)}/accept-as-me`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.children }),
  });
}
