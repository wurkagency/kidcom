import type { ThemeManifest } from "@kidcom/theme-kit";

import { DesktopGateScreen, NotFoundScreen, PendingScreen } from "../system/SystemScreens";

// Every screen id → its Aura implementation. Screens are lazy-loaded chunks
// (`lazy(() => import(...))`) as each build phase lands; PendingScreen marks
// the ones still to come (tasks/todo.md) and must be gone after Phase 7.
export const screens: ThemeManifest["screens"] = {
  "system.desktopGate": DesktopGateScreen,
  "system.notFound": NotFoundScreen,

  // Phase 2 — auth
  "auth.login": PendingScreen,
  "auth.twoFactor": PendingScreen,
  "auth.signup": PendingScreen,
  "auth.phoneVerify": PendingScreen,
  "auth.forgotPassword": PendingScreen,
  "auth.resetPassword": PendingScreen,
  "auth.verifyEmail": PendingScreen,
  "auth.inviteAccept": PendingScreen,

  // Phase 7 — onboarding
  "onboarding.child": PendingScreen,
  "onboarding.invite": PendingScreen,
  "onboarding.plan": PendingScreen,

  // Phase 3 — today + calendar
  today: PendingScreen,
  "calendar.agenda": PendingScreen,
  "calendar.week": PendingScreen,
  "calendar.month": PendingScreen,
  "calendar.school": PendingScreen,
  "calendar.eventDetail": PendingScreen,
  "calendar.eventEdit": PendingScreen,
  "calendar.swapRequest": PendingScreen,
  "notes.edit": PendingScreen,
  "tasks.edit": PendingScreen,

  // Phase 4 — moments + media
  "moments.feed": PendingScreen,
  "moments.post": PendingScreen,
  "moments.create": PendingScreen,
  "media.gallery": PendingScreen,
  "media.viewer": PendingScreen,
  "media.download": PendingScreen,
  bookmarks: PendingScreen,

  // Phase 5 — lists, children, health
  "lists.overview": PendingScreen,
  "lists.itemEdit": PendingScreen,
  "children.overview": PendingScreen,
  "child.profile": PendingScreen,
  "child.edit": PendingScreen,
  "child.health": PendingScreen,
  "child.medical": PendingScreen,
  "child.contacts": PendingScreen,
  "child.growth": PendingScreen,

  // Phase 6 — messages, notifications, search
  "messages.inbox": PendingScreen,
  "messages.thread": PendingScreen,
  "messages.compose": PendingScreen,
  notifications: PendingScreen,
  search: PendingScreen,

  // Phase 7 — profile menu
  "profile.menu": PendingScreen,
  "profile.account": PendingScreen,
  "family.overview": PendingScreen,
  "family.invite": PendingScreen,
  "billing.overview": PendingScreen,
  "billing.checkout": PendingScreen,
  "preferences.overview": PendingScreen,
  "preferences.language": PendingScreen,
  "preferences.theme": PendingScreen,
  "preferences.notifications": PendingScreen,
  "preferences.categories": PendingScreen,
  "preferences.security": PendingScreen,
};
