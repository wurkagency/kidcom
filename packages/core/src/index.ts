// @kidcom/core — the headless application. Themes build every pixel from
// what is exported here; nothing in core renders styled UI.

// App composition (used by the host app only)
export { KidcomApp, useDesktopGateState } from "./KidcomApp";

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
} from "./auth/hooks";

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
