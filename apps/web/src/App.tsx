import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { HomePage } from "./routes/HomePage";
import { CalendarPage } from "./routes/CalendarPage";
import { JournalPage } from "./routes/JournalPage";
import { GrowthPage } from "./routes/GrowthPage";
import { ProfilePage } from "./routes/ProfilePage";
import { WelcomePage } from "./routes/WelcomePage";
import { LoginPage } from "./routes/LoginPage";
import { SignupPage } from "./routes/SignupPage";
import { OnboardingChildPage } from "./routes/OnboardingChildPage";
import { OnboardingInvitePage } from "./routes/OnboardingInvitePage";
import { ChildProfilePage } from "./routes/ChildProfilePage";
import { ChildMedicalPage } from "./routes/ChildMedicalPage";
import { ChildContactsPage } from "./routes/ChildContactsPage";
import { JournalPostPage } from "./routes/JournalPostPage";
import { JournalComposePage } from "./routes/JournalComposePage";
import { ListsPage } from "./routes/ListsPage";
import { MessagesPage } from "./routes/MessagesPage";
import { MessageComposePage } from "./routes/MessageComposePage";
import { MessageThreadPage } from "./routes/MessageThreadPage";
import { NotesPage } from "./routes/NotesPage";
import { BillingPage } from "./routes/BillingPage";
import { InviteAcceptPage } from "./routes/InviteAcceptPage";
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
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/welcome" element={<Navigate to="/" replace />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/signup" element={<Navigate to="/" replace />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
      <Route path="/onboarding/child" element={<OnboardingChildPage />} />
      <Route path="/onboarding/invite" element={<OnboardingInvitePage />} />
      <Route
        path="/*"
        element={
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/journal" element={<JournalPage />} />
              <Route path="/growth" element={<GrowthPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/children/:childId" element={<ChildProfilePage />} />
              <Route path="/children/:childId/medical" element={<ChildMedicalPage />} />
              <Route path="/children/:childId/contacts" element={<ChildContactsPage />} />
              <Route path="/journal/new" element={<JournalComposePage />} />
              <Route path="/journal/:postId" element={<JournalPostPage />} />
              <Route path="/children/:childId/lists" element={<ListsPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/messages/new" element={<MessageComposePage />} />
              <Route path="/messages/:threadId" element={<MessageThreadPage />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/billing" element={<BillingPage />} />
            </Routes>
          </AppShell>
        }
      />
    </Routes>
  );
}
