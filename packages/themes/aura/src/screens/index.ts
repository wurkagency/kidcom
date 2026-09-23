import { lazy, type ComponentType } from "react";
import type { ThemeManifest } from "@kidcom/theme-kit";

import { DesktopGateScreen, NotFoundScreen } from "../system/SystemScreens";

/** A screen as its own lazily loaded chunk, from a named export. */
function screen<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const loadAuth = () => import("../auth/LoginScreen");
const loadTwoFactor = () => import("../auth/TwoFactorScreen");
const loadSignup = () => import("../auth/SignupScreen");
const loadSetup = () => import("../auth/SetupScreens");
const loadRecovery = () => import("../auth/RecoveryScreens");
const loadToday = () => import("../calendar/TodayScreen");
const loadCalendar = () => import("../calendar/CalendarScreen");
const loadSchool = () => import("../calendar/SchoolScreen");
const loadEvents = () => import("../calendar/EventScreens");
const loadEditors = () => import("../calendar/EditorScreens");
const loadCategories = () => import("../preferences/CategoriesScreen");
const loadFeed = () => import("../moments/MomentsFeedScreen");
const loadPost = () => import("../moments/MomentPostScreen");
const loadCreateMoment = () => import("../moments/CreateMomentScreen");
const loadBookmarks = () => import("../moments/BookmarksScreen");
const loadGallery = () => import("../media/GalleryScreen");
const loadViewer = () => import("../media/ViewerScreen");
const loadDownload = () => import("../media/DownloadScreen");
const loadLists = () => import("../lists/ListsScreen");
const loadListEdit = () => import("../lists/ListItemEditScreen");
const loadChildren = () => import("../children/ChildrenScreen");
const loadProfile = () => import("../children/ChildProfileScreen");
const loadChildEdit = () => import("../children/ChildEditScreen");
const loadHealth = () => import("../children/HealthTimelineScreen");
const loadCare = () => import("../children/CareScreens");
const loadCustody = () => import("../children/CustodyPlanScreen");
const loadInvite = () => import("../children/InviteScreen");
const loadInbox = () => import("../messages/InboxScreen");
const loadThread = () => import("../messages/ThreadScreen");
const loadCompose = () => import("../messages/ComposeScreen");
const loadNotifications = () => import("../messages/NotificationsScreen");
const loadSearch = () => import("../messages/SearchScreen");
const loadInviteAccept = () => import("../auth/InviteAcceptScreen");
const loadOnboarding = () => import("../onboarding/OnboardingScreens");
const loadProfileMenu = () => import("../profile/ProfileMenuScreen");
const loadAccount = () => import("../profile/AccountScreen");
const loadFamily = () => import("../profile/FamilyScreen");
const loadBilling = () => import("../billing/BillingScreens");
const loadPreferences = () => import("../preferences/PreferenceScreens");

// Every screen id → its Aura implementation, as lazy-loaded chunks.
export const screens: ThemeManifest["screens"] = {
  "system.desktopGate": DesktopGateScreen,
  "system.notFound": NotFoundScreen,

  // Auth
  "auth.login": screen(loadAuth, "LoginScreen"),
  "auth.twoFactor": screen(loadTwoFactor, "TwoFactorScreen"),
  "auth.signup": screen(loadSignup, "SignupScreen"),
  "auth.phoneVerify": screen(loadSetup, "PhoneVerifyScreen"),
  "auth.createPassword": screen(loadSetup, "CreatePasswordScreen"),
  "auth.forgotPassword": screen(loadRecovery, "ForgotPasswordScreen"),
  "auth.resetPassword": screen(loadRecovery, "ResetPasswordScreen"),
  "auth.verifyEmail": screen(loadSetup, "VerifyEmailScreen"),
  // Phase 7 — with family invites
  "auth.inviteAccept": screen(loadInviteAccept, "InviteAcceptScreen"),

  // Phase 7 — onboarding
  "onboarding.child": screen(loadOnboarding, "OnboardingChildScreen"),
  "onboarding.invite": screen(loadOnboarding, "OnboardingInviteScreen"),
  "onboarding.plan": screen(loadOnboarding, "OnboardingPlanScreen"),

  // Phase 3 — today + calendar
  today: screen(loadToday, "TodayScreen"),
  "calendar.agenda": screen(loadCalendar, "AgendaScreen"),
  "calendar.week": screen(loadCalendar, "WeekScreen"),
  "calendar.month": screen(loadCalendar, "MonthScreen"),
  "calendar.school": screen(loadSchool, "SchoolScreen"),
  "calendar.eventDetail": screen(loadEvents, "EventDetailScreen"),
  "calendar.eventEdit": screen(loadEvents, "EventEditScreen"),
  "calendar.swapRequest": screen(loadEditors, "SwapRequestScreen"),
  "notes.edit": screen(loadEditors, "NoteEditScreen"),
  "tasks.edit": screen(loadEditors, "TaskEditScreen"),

  // Phase 4 — moments + media
  "moments.feed": screen(loadFeed, "MomentsFeedScreen"),
  "moments.post": screen(loadPost, "MomentPostScreen"),
  "moments.create": screen(loadCreateMoment, "CreateMomentScreen"),
  "media.gallery": screen(loadGallery, "GalleryScreen"),
  "media.viewer": screen(loadViewer, "ViewerScreen"),
  "media.download": screen(loadDownload, "DownloadScreen"),
  bookmarks: screen(loadBookmarks, "BookmarksScreen"),

  // Phase 5 — lists, children, health
  "lists.overview": screen(loadLists, "ListsScreen"),
  "lists.itemEdit": screen(loadListEdit, "ListItemEditScreen"),
  "children.overview": screen(loadChildren, "ChildrenScreen"),
  "child.profile": screen(loadProfile, "ChildProfileScreen"),
  "child.edit": screen(loadChildEdit, "ChildEditScreen"),
  "child.health": screen(loadHealth, "HealthTimelineScreen"),
  "child.medical": screen(loadCare, "MedicalScreen"),
  "child.contacts": screen(loadCare, "ContactsScreen"),
  "child.growth": screen(loadCare, "GrowthScreen"),
  "child.custody": screen(loadCustody, "CustodyPlanScreen"),

  // Phase 6 — messages, notifications, search
  "messages.inbox": screen(loadInbox, "InboxScreen"),
  "messages.thread": screen(loadThread, "ThreadScreen"),
  "messages.compose": screen(loadCompose, "ComposeScreen"),
  notifications: screen(loadNotifications, "NotificationsScreen"),
  search: screen(loadSearch, "SearchScreen"),

  // Phase 7 — profile menu
  "profile.menu": screen(loadProfileMenu, "ProfileMenuScreen"),
  "profile.account": screen(loadAccount, "AccountScreen"),
  "family.overview": screen(loadFamily, "FamilyScreen"),
  "family.invite": screen(loadInvite, "InviteScreen"),
  "billing.overview": screen(loadBilling, "BillingScreen"),
  "billing.checkout": screen(loadBilling, "CheckoutScreen"),
  "preferences.overview": screen(loadPreferences, "PreferencesScreen"),
  "preferences.language": screen(loadPreferences, "LanguageScreen"),
  "preferences.theme": screen(loadPreferences, "ThemeScreen"),
  "preferences.notifications": screen(loadPreferences, "NotificationSettingsScreen"),
  "preferences.categories": screen(loadCategories, "CategoriesScreen"),
  "preferences.security": screen(loadPreferences, "SecurityScreen"),
};
