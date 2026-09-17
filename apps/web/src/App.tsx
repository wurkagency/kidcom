import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { HomePage } from "./routes/HomePage";
import { CalendarPage } from "./routes/CalendarPage";
import { JournalPage } from "./routes/JournalPage";
import { GrowthPage } from "./routes/GrowthPage";
import { ProfilePage } from "./routes/ProfilePage";
import { ChildrenOverviewPage } from "./routes/ChildrenOverviewPage";
import { WelcomePage } from "./routes/WelcomePage";
import { LoginPage } from "./routes/LoginPage";
import { ForgotPasswordPage } from "./routes/ForgotPasswordPage";
import { ResetPasswordPage } from "./routes/ResetPasswordPage";
import { SignupPage } from "./routes/SignupPage";
import { OnboardingChildPage } from "./routes/OnboardingChildPage";
import { OnboardingInvitePage } from "./routes/OnboardingInvitePage";
import { OnboardingPlanPage } from "./routes/OnboardingPlanPage";
import { LoginTwoFactorPage } from "./routes/LoginTwoFactorPage";
import { ChildProfilePage } from "./routes/ChildProfilePage";
import { ChildMedicalPage } from "./routes/ChildMedicalPage";
import { ChildContactsPage } from "./routes/ChildContactsPage";
import { EventFormPage } from "./routes/EventFormPage";
import { EventDetailPage } from "./routes/EventDetailPage";
import { JournalPostPage } from "./routes/JournalPostPage";
import { JournalComposePage } from "./routes/JournalComposePage";
import { ListsPage } from "./routes/ListsPage";
import { ListItemFormPage } from "./routes/ListItemFormPage";
import { ListItemDetailPage } from "./routes/ListItemDetailPage";
import { MessagesPage } from "./routes/MessagesPage";
import { MessageComposePage } from "./routes/MessageComposePage";
import { MessageThreadPage } from "./routes/MessageThreadPage";
import { BillingPage } from "./routes/BillingPage";
import { AppPreferencesPage } from "./routes/AppPreferencesPage";
import { ThemesPage } from "./routes/ThemesPage";
import { NotificationSettingsPage } from "./routes/NotificationSettingsPage";
import { SettingsChoicePage } from "./routes/SettingsChoicePage";
import { PrivacySecurityPage } from "./routes/PrivacySecurityPage";
import { InviteAcceptPage } from "./routes/InviteAcceptPage";
import { VerifyEmailPage } from "./routes/VerifyEmailPage";
import { VerifyEmailGate } from "./components/VerifyEmailGate";
import { InstallPrompt } from "./components/InstallPrompt";
import { useAuth } from "./lib/AuthContext";

// Route guarding: unauthenticated visitors only ever see welcome/login/signup
// (anything else bounces to /welcome). Authenticated users skip past those
// three straight to the app. Onboarding (/onboarding/*) is reachable by any
// authenticated user but never forced — both onboarding screens' "skip"
// buttons land on "/", so a zero-children account isn't trapped in a loop;
// Home/Profile handle the empty-children case themselves.
export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="font-body-md text-body-md text-on-surface-variant">Loading…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/verify" element={<LoginTwoFactorPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    );
  }

  // Full gate: a signed-in user with no verified email sees nothing else —
  // not even onboarding or the app shell — until they click the link in
  // their verification email. /verify-email itself stays reachable (that's
  // what the emailed link points at) so it can lift the gate.
  if (!user.emailVerifiedAt) {
    return (
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="*" element={<VerifyEmailGate />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/welcome" element={<Navigate to="/" replace />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/login/verify" element={<Navigate to="/" replace />} />
      <Route path="/signup" element={<Navigate to="/" replace />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/onboarding/child" element={<OnboardingChildPage />} />
      <Route path="/onboarding/invite" element={<OnboardingInvitePage />} />
      <Route path="/onboarding/plan" element={<OnboardingPlanPage />} />
      <Route
        path="/*"
        element={
          <AppShell>
            <InstallPrompt />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/journal" element={<JournalPage />} />
              <Route path="/lists" element={<ListsPage />} />
              <Route path="/children/:childId/lists/new" element={<ListItemFormPage />} />
              <Route path="/children/:childId/lists/:itemId" element={<ListItemDetailPage />} />
              <Route path="/children/:childId/lists/:itemId/edit" element={<ListItemFormPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/kids" element={<ChildrenOverviewPage />} />
              <Route path="/children/:childId" element={<ChildProfilePage />} />
              <Route path="/children/:childId/medical" element={<ChildMedicalPage />} />
              <Route path="/children/:childId/contacts" element={<ChildContactsPage />} />
              <Route path="/children/:childId/growth" element={<GrowthPage />} />
              <Route path="/children/:childId/calendar-events/new" element={<EventFormPage />} />
              <Route path="/children/:childId/calendar-events/:eventId" element={<EventDetailPage />} />
              <Route path="/children/:childId/calendar-events/:eventId/edit" element={<EventFormPage />} />
              <Route path="/journal/new" element={<JournalComposePage />} />
              <Route path="/journal/media" element={<Navigate to="/journal?tab=media" replace />} />
              <Route path="/journal/:postId" element={<JournalPostPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/messages/new" element={<MessageComposePage />} />
              <Route path="/messages/:threadId" element={<MessageThreadPage />} />
              <Route path="/notes" element={<Navigate to="/messages?tab=notes" replace />} />
              <Route path="/preferences" element={<AppPreferencesPage />} />
              <Route path="/preferences/themes" element={<ThemesPage />} />
              <Route path="/preferences/:field" element={<SettingsChoicePage />} />
              <Route path="/security" element={<PrivacySecurityPage />} />
              <Route path="/security/:field" element={<SettingsChoicePage />} />
              <Route path="/notifications" element={<NotificationSettingsPage />} />
              <Route path="/billing" element={<BillingPage />} />
            </Routes>
          </AppShell>
        }
      />
    </Routes>
  );
}
