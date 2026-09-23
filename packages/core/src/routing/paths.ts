// Typed path builders. Screens link with these instead of string templates,
// so a route change is a compile error at every call site.
const enc = encodeURIComponent;

export const paths = {
  today: () => "/",
  calendar: {
    agenda: () => "/calendar",
    week: () => "/calendar/week",
    month: () => "/calendar/month",
    school: () => "/calendar/school",
  },
  events: {
    create: () => "/events/new",
    detail: (childId: string, eventId: string) => `/children/${enc(childId)}/events/${enc(eventId)}`,
    edit: (childId: string, eventId: string) => `/children/${enc(childId)}/events/${enc(eventId)}/edit`,
  },
  swapRequest: () => "/swaps/new",
  notes: { create: () => "/notes/new" },
  tasks: { create: () => "/tasks/new" },
  moments: {
    feed: () => "/moments",
    create: () => "/moments/new",
    detail: (childId: string, momentId: string) => `/children/${enc(childId)}/moments/${enc(momentId)}`,
  },
  media: {
    gallery: () => "/media",
    download: () => "/media/download",
    viewer: (mediaId: string) => `/media/${enc(mediaId)}`,
  },
  bookmarks: () => "/bookmarks",
  lists: {
    overview: () => "/lists",
    create: () => "/lists/new",
    edit: (childId: string, itemId: string) => `/children/${enc(childId)}/lists/${enc(itemId)}/edit`,
  },
  children: {
    overview: () => "/children",
    create: () => "/children/new",
    profile: (childId: string) => `/children/${enc(childId)}`,
    edit: (childId: string) => `/children/${enc(childId)}/edit`,
    health: (childId: string) => `/children/${enc(childId)}/health`,
    medical: (childId: string) => `/children/${enc(childId)}/medical`,
    contacts: (childId: string) => `/children/${enc(childId)}/contacts`,
    growth: (childId: string) => `/children/${enc(childId)}/growth`,
  },
  messages: {
    inbox: () => "/messages",
    compose: () => "/messages/new",
    thread: (threadId: string) => `/messages/${enc(threadId)}`,
  },
  notifications: () => "/notifications",
  search: () => "/search",
  profile: {
    menu: () => "/profile",
    account: () => "/profile/account",
  },
  family: {
    overview: () => "/family",
    invite: () => "/family/invite",
  },
  billing: {
    overview: () => "/billing",
    checkout: () => "/billing/checkout",
  },
  preferences: {
    overview: () => "/preferences",
    language: () => "/preferences/language",
    theme: () => "/preferences/theme",
    notifications: () => "/preferences/notifications",
    categories: () => "/preferences/categories",
    security: () => "/preferences/security",
  },
  auth: {
    login: () => "/login",
    twoFactor: () => "/login/verify",
    signup: () => "/signup",
    forgotPassword: () => "/forgot-password",
    resetPassword: () => "/reset-password",
    verifyEmail: () => "/verify-email",
    verifyPhone: () => "/verify-phone",
    createPassword: () => "/create-password",
  },
  onboarding: {
    child: () => "/onboarding/child",
    invite: () => "/onboarding/invite",
    plan: () => "/onboarding/plan",
  },
} as const;
