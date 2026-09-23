import type { ScreenId, ShellKind } from "@kidcom/theme-kit";

/**
 * Who may open a route.
 *  - public:  anyone (links from emails: verify email, reset password, invites)
 *  - guest:   signed-out only; a signed-in user is sent home
 *  - setup:   signed in, still finishing account setup (verify phone, create
 *             password) — only the screen for the current step is reachable
 *  - authed:  signed in with setup complete and a verified email
 */
export type RouteAccess = "public" | "guest" | "setup" | "authed";

export type AppRoute = {
  screen: ScreenId;
  path: string;
  shell: ShellKind;
  access: RouteAccess;
};

// The single routing table. Themes decide how a screen looks; they never
// decide which URL it lives at or who may see it.
export const ROUTES: readonly AppRoute[] = [
  // Authentication
  { screen: "auth.login", path: "/login", shell: "auth", access: "guest" },
  { screen: "auth.twoFactor", path: "/login/verify", shell: "auth", access: "guest" },
  { screen: "auth.signup", path: "/signup", shell: "auth", access: "guest" },
  { screen: "auth.forgotPassword", path: "/forgot-password", shell: "auth", access: "guest" },
  { screen: "auth.resetPassword", path: "/reset-password", shell: "auth", access: "public" },
  { screen: "auth.verifyEmail", path: "/verify-email", shell: "auth", access: "public" },
  { screen: "auth.inviteAccept", path: "/invite/:token", shell: "auth", access: "public" },
  { screen: "auth.phoneVerify", path: "/verify-phone", shell: "auth", access: "setup" },
  { screen: "auth.createPassword", path: "/create-password", shell: "auth", access: "setup" },

  // Onboarding
  { screen: "onboarding.child", path: "/onboarding/child", shell: "stack", access: "authed" },
  { screen: "onboarding.invite", path: "/onboarding/invite", shell: "stack", access: "authed" },
  { screen: "onboarding.plan", path: "/onboarding/plan", shell: "stack", access: "authed" },

  // Today + calendar
  { screen: "today", path: "/", shell: "app", access: "authed" },
  { screen: "calendar.agenda", path: "/calendar", shell: "app", access: "authed" },
  { screen: "calendar.week", path: "/calendar/week", shell: "app", access: "authed" },
  { screen: "calendar.month", path: "/calendar/month", shell: "app", access: "authed" },
  { screen: "calendar.school", path: "/calendar/school", shell: "app", access: "authed" },
  { screen: "calendar.eventEdit", path: "/events/new", shell: "app", access: "authed" },
  { screen: "calendar.eventDetail", path: "/children/:childId/events/:eventId", shell: "app", access: "authed" },
  { screen: "calendar.eventEdit", path: "/children/:childId/events/:eventId/edit", shell: "app", access: "authed" },
  { screen: "calendar.swapRequest", path: "/swaps/new", shell: "app", access: "authed" },
  { screen: "notes.edit", path: "/notes/new", shell: "app", access: "authed" },
  { screen: "tasks.edit", path: "/tasks/new", shell: "app", access: "authed" },

  // Moments + media
  { screen: "moments.feed", path: "/moments", shell: "app", access: "authed" },
  { screen: "moments.create", path: "/moments/new", shell: "app", access: "authed" },
  { screen: "moments.post", path: "/children/:childId/moments/:momentId", shell: "app", access: "authed" },
  { screen: "media.gallery", path: "/media", shell: "app", access: "authed" },
  { screen: "media.download", path: "/media/download", shell: "app", access: "authed" },
  { screen: "media.viewer", path: "/media/:mediaId", shell: "blank", access: "authed" },
  { screen: "bookmarks", path: "/bookmarks", shell: "app", access: "authed" },

  // Lists
  { screen: "lists.overview", path: "/lists", shell: "app", access: "authed" },
  { screen: "lists.itemEdit", path: "/lists/new", shell: "app", access: "authed" },
  { screen: "lists.itemEdit", path: "/children/:childId/lists/:itemId/edit", shell: "app", access: "authed" },

  // Children + health
  { screen: "children.overview", path: "/children", shell: "app", access: "authed" },
  { screen: "child.edit", path: "/children/new", shell: "app", access: "authed" },
  { screen: "child.profile", path: "/children/:childId", shell: "app", access: "authed" },
  { screen: "child.edit", path: "/children/:childId/edit", shell: "app", access: "authed" },
  { screen: "child.health", path: "/children/:childId/health", shell: "app", access: "authed" },
  { screen: "child.medical", path: "/children/:childId/medical", shell: "app", access: "authed" },
  { screen: "child.contacts", path: "/children/:childId/contacts", shell: "app", access: "authed" },
  { screen: "child.growth", path: "/children/:childId/growth", shell: "app", access: "authed" },

  // Messages, notifications, search
  { screen: "messages.inbox", path: "/messages", shell: "app", access: "authed" },
  { screen: "messages.compose", path: "/messages/new", shell: "app", access: "authed" },
  { screen: "messages.thread", path: "/messages/:threadId", shell: "app", access: "authed" },
  { screen: "notifications", path: "/notifications", shell: "app", access: "authed" },
  { screen: "search", path: "/search", shell: "app", access: "authed" },

  // Profile menu
  { screen: "profile.menu", path: "/profile", shell: "app", access: "authed" },
  { screen: "profile.account", path: "/profile/account", shell: "app", access: "authed" },
  { screen: "family.overview", path: "/family", shell: "app", access: "authed" },
  { screen: "family.invite", path: "/family/invite", shell: "app", access: "authed" },
  { screen: "billing.overview", path: "/billing", shell: "app", access: "authed" },
  { screen: "billing.checkout", path: "/billing/checkout", shell: "app", access: "authed" },
  { screen: "preferences.overview", path: "/preferences", shell: "app", access: "authed" },
  { screen: "preferences.language", path: "/preferences/language", shell: "app", access: "authed" },
  { screen: "preferences.theme", path: "/preferences/theme", shell: "app", access: "authed" },
  { screen: "preferences.notifications", path: "/preferences/notifications", shell: "app", access: "authed" },
  { screen: "preferences.categories", path: "/preferences/categories", shell: "app", access: "authed" },
  { screen: "preferences.security", path: "/preferences/security", shell: "app", access: "authed" },
];
