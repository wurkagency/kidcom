// @kinnd/core — the headless application. Themes build every pixel from
// what is exported here; nothing in core renders styled UI.

// App composition (used by the host app only)
export { KinndApp, useDesktopGateState } from "./KinndApp";

// HTTP
export { api, apiUrl, ApiError } from "./api/client";
export { queryKeys } from "./api/queryClient";
export { mediaUrl } from "./media/mediaUrl";

// Session + account
export {
  useMe,
  useCurrentUser,
  useLogin,
  useVerifyTwoFactor,
  useResendTwoFactor,
  useCancelTwoFactor,
  useSignup,
  useLogout,
  useForgotPassword,
  useResetPassword,
  useVerifyEmail,
  useResendVerification,
  useUpdateProfile,
  useSendPhoneCode,
  useVerifyPhone,
  useSetPassword,
  usePendingOAuthSignup,
  useCompleteOAuthSignup,
  oauthStartUrl,
} from "./auth/hooks";
export { pendingSetupStep, SETUP_STEP_PATH } from "./auth/setup";
export type { SetupStep } from "./auth/setup";
export { PHONE_COUNTRIES, DEFAULT_PHONE_COUNTRY, toE164, maskPhone, checkPassword, splitFullName } from "./auth/forms";
export type { PhoneCountry, PasswordCheck } from "./auth/forms";

// Legal
export { LEGAL_URLS } from "./legal";

// Children
export { useChildren } from "./children/hooks";
export { useActiveChildren } from "./children/ActiveChildren";
export type { ChildFilter } from "./children/ActiveChildren";

// Routing
export { ROUTES } from "./routing/routes";
export type { AppRoute, RouteAccess } from "./routing/routes";
export { paths } from "./routing/paths";
export { safeNextPath } from "./routing/AppRouter";
export { useCurrentScreen } from "./routing/currentScreen";
export * from "./routing/nav";

// i18n + formatting
export * from "./i18n";

// Device
export { isMobileDevice } from "./device/desktopGate";
export type { DesktopGate } from "./device/desktopGate";

// Calendar, Today, categories
export * from "./calendar/dates";
export * from "./calendar/hooks";
export * from "./calendar/filters";

// Moments, media, bookmarks
export * from "./moments/hooks";

// Children, lists, health
export * from "./children/familyHooks";

// Messages, notifications, search
export * from "./messages/hooks";

// Account, security, notifications, push, billing, invites
export * from "./account/hooks";
