// Every screen the app has, by stable id. The core maps routes to these ids;
// a theme must provide a component for every one of them (see defineTheme).
// Adding a screen = add its id here, a route in @kinnd/core, and an
// implementation in every theme.
export const SCREEN_IDS = [
  // System
  "system.desktopGate",
  "system.notFound",

  // Authentication
  "auth.login",
  "auth.twoFactor",
  "auth.signup",
  "auth.phoneVerify",
  "auth.createPassword",
  "auth.forgotPassword",
  "auth.resetPassword",
  "auth.verifyEmail",
  "auth.inviteAccept",

  // Onboarding
  "onboarding.child",
  "onboarding.invite",
  "onboarding.plan",

  // Today + calendar
  "today",
  "calendar.agenda",
  "calendar.week",
  "calendar.month",
  "calendar.school",
  "calendar.eventDetail",
  "calendar.eventEdit",
  "calendar.swapRequest",
  "notes.edit",
  "tasks.edit",

  // Moments + media
  "moments.feed",
  "moments.post",
  "moments.create",
  "media.gallery",
  "media.viewer",
  "media.download",
  "bookmarks",

  // Lists
  "lists.overview",
  "lists.itemEdit",

  // Children + health
  "children.overview",
  "child.profile",
  "child.edit",
  "child.health",
  "child.medical",
  "child.contacts",
  "child.growth",
  "child.custody",

  // Messages, notifications, search
  "messages.inbox",
  "messages.thread",
  "messages.compose",
  "notifications",
  "search",

  // Profile menu
  "profile.menu",
  "profile.account",
  "family.overview",
  "family.invite",
  "billing.overview",
  "billing.checkout",
  "preferences.overview",
  "preferences.language",
  "preferences.theme",
  "preferences.notifications",
  "preferences.categories",
  "preferences.security",
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

// The chrome a screen sits in. A theme decides what each looks like.
//  - app:   tab screens — the persistent header + bottom dock
//  - stack: pushed detail/editor screens — back button + title, no dock
//  - auth:  signed-out flows
//  - blank: full-bleed screens with no chrome (media viewer, desktop gate)
export const SHELL_KINDS = ["app", "stack", "auth", "blank"] as const;
export type ShellKind = (typeof SHELL_KINDS)[number];
