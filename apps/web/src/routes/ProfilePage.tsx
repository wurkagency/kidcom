import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AvatarUpload } from "../components/AvatarUpload";
import { Icon } from "../components/Icon";
import { apiFetch, apiPatch } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { disablePush, enablePush, getPushSubscriptionState } from "../lib/push";

export function ProfilePage() {
  const { user, children, refresh } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [pushState, setPushState] = useState<
    "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading"
  >("loading");
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    getPushSubscriptionState()
      .then(setPushState)
      .catch(() => setPushState("unsubscribed"));
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
      await refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  async function handlePushToggle() {
    setPushBusy(true);
    setPushError(null);
    try {
      if (pushState === "subscribed") {
        await disablePush();
        setPushState("unsubscribed");
      } else {
        await enablePush();
        setPushState("subscribed");
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Couldn't update notification settings");
      setPushState(await getPushSubscriptionState());
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <section className="px-container-padding pt-6 flex flex-col gap-section-margin">
      <div className="flex flex-col gap-2">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
          Profile
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Child details, medical info, and account settings.
        </p>
      </div>
      {user && (
        <div className="bg-surface-container rounded-lg p-6 flex flex-col items-center gap-3">
          <AvatarUpload
            currentAssetId={user.avatarUrl}
            fallbackLetter={user.firstName.charAt(0)}
            size="lg"
            onUploaded={async (newAssetId) => {
              await apiPatch("/auth/me", { avatarMediaAssetId: newAssetId });
              await refresh();
            }}
          />
          <div className="flex flex-col items-center gap-1">
            <p className="font-label-md text-label-md text-on-surface">
              {user.firstName} {user.lastName}
            </p>
            <p className="font-body-md text-body-md text-on-surface-variant">{user.email}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
          Children
        </h2>
        {children.length === 0 ? (
          <div className="bg-surface-container rounded-lg p-6 flex flex-col gap-3">
            <p className="font-body-md text-body-md text-on-surface-variant">
              You haven't added a child yet.
            </p>
            <Link
              to="/onboarding/child"
              className="self-start bg-primary text-on-primary font-label-md text-label-md py-2 px-5 rounded-full"
            >
              Add a child
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {children.map((child) => (
              <Link
                key={child.id}
                to={`/children/${child.id}`}
                className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed font-headline-md">
                  {child.firstName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-label-md text-label-md text-on-surface">
                    {child.firstName} {child.lastName}
                  </p>
                </div>
                <Icon name="chevron_right" className="text-on-surface-variant" />
              </Link>
            ))}
            <Link
              to="/onboarding/child"
              className="w-full py-3 rounded-xl bg-surface-container text-primary font-label-md text-label-md flex items-center justify-center gap-2"
            >
              <Icon name="add" />
              Add another child
            </Link>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
          Family Tools
        </h2>
        <div className="flex gap-3">
          <Link
            to="/messages"
            className="flex-1 bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col items-center gap-2 text-center"
          >
            <Icon name="chat_bubble" className="text-primary" />
            <span className="font-label-md text-label-md text-on-surface">Messages</span>
          </Link>
          <Link
            to="/notes"
            className="flex-1 bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col items-center gap-2 text-center"
          >
            <Icon name="sticky_note_2" className="text-secondary" />
            <span className="font-label-md text-label-md text-on-surface">My Notes</span>
          </Link>
          <Link
            to="/billing"
            className="flex-1 bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col items-center gap-2 text-center"
          >
            <Icon name="workspace_premium" className="text-tertiary" />
            <span className="font-label-md text-label-md text-on-surface">Subscription</span>
          </Link>
        </div>
      </div>

      {pushState !== "unsupported" && (
        <div className="flex flex-col gap-2">
          <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
            Notifications
          </h2>
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Icon name="notifications" className="text-primary" />
              <div className="flex flex-col">
                <span className="font-label-md text-label-md text-on-surface">Push notifications</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  {pushState === "denied"
                    ? "Blocked in your browser settings"
                    : pushState === "subscribed"
                      ? "New messages, swap requests, and appointment reminders"
                      : "Off"}
                </span>
              </div>
            </div>
            <button
              onClick={handlePushToggle}
              disabled={pushBusy || pushState === "denied" || pushState === "loading"}
              className={`font-label-sm text-label-sm py-2 px-4 rounded-full disabled:opacity-60 ${
                pushState === "subscribed" ? "bg-surface-container text-on-surface-variant" : "bg-primary text-on-primary"
              }`}
            >
              {pushState === "subscribed" ? "Turn off" : "Turn on"}
            </button>
          </div>
          {pushError && (
            <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
              {pushError}
            </p>
          )}
        </div>
      )}

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="self-start bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md py-3 px-6 rounded-full disabled:opacity-60"
      >
        {loggingOut ? "Logging out…" : "Log out"}
      </button>
    </section>
  );
}
