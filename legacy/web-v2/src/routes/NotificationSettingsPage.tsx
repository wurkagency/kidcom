import { useEffect, useState } from "react";
import type { NotificationPreferencesDto, UpdateNotificationPreferencesRequest } from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { Toggle } from "../components/Toggle";
import { apiGet, apiPatch, ApiRequestError } from "../lib/api";
import { useHeaderConfig } from "../lib/HeaderContext";
import { disablePush, enablePush, getPushSubscriptionState } from "../lib/push";

// Matches docs/stitch_splitkid/notification_settings/code.html: Delivery
// Methods, Categories, Quiet Hours. Push Notifications reads the real
// PushSubscription-existing-or-not state (moved here from ProfilePage, which
// now just links here) — everything else is a real persisted preference via
// /notification-preferences, though Email/Google/Office365 sync don't have a
// backend integration behind them yet (no email sender, no OAuth flow exists
// in this app) — the toggle genuinely saves, ready to wire up later.
export function NotificationSettingsPage() {
  useHeaderConfig({ title: "Notifications", backTo: "/profile" }, []);

  const [prefs, setPrefs] = useState<NotificationPreferencesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [pushState, setPushState] = useState<
    "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading"
  >("loading");
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    apiGet<NotificationPreferencesDto>("/notification-preferences")
      .then(setPrefs)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Couldn't load your notification settings"))
      .finally(() => setLoading(false));
    getPushSubscriptionState()
      .then(setPushState)
      .catch(() => setPushState("unsubscribed"));
  }, []);

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

  async function update(patch: UpdateNotificationPreferencesRequest) {
    if (!prefs) return;
    const optimistic = { ...prefs, ...patch };
    setPrefs(optimistic);
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPatch<NotificationPreferencesDto>("/notification-preferences", patch);
      setPrefs(updated);
    } catch (err) {
      setPrefs(prefs);
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save that change");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !prefs) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col w-full pb-8">
      <div className="px-container-padding py-6 flex flex-col gap-2">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Notifications</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Manage how and when you receive updates.
        </p>
      </div>

      <div className="px-container-padding flex flex-col gap-section-margin">
        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="font-label-md text-label-md text-primary uppercase tracking-wider pl-2">
            Delivery Methods
          </h2>
          <div className="bg-surface-container-low rounded-xl p-4 shadow-sm flex flex-col gap-4">
            <ToggleRow
              icon="smartphone"
              iconClass="bg-primary-container/20 text-primary"
              label="Push Notifications"
              sublabel={
                pushState === "denied"
                  ? "Blocked in your browser settings"
                  : pushState === "unsupported"
                    ? "Not supported on this browser"
                    : "Instant alerts on your device"
              }
              checked={pushState === "subscribed"}
              disabled={pushBusy || pushState === "denied" || pushState === "unsupported" || pushState === "loading"}
              onToggle={handlePushToggle}
            />
            <Divider />
            <ToggleRow
              icon="mail"
              iconClass="bg-tertiary-container/20 text-tertiary"
              label="Email Updates"
              sublabel="Daily digest of activities"
              checked={prefs.emailEnabled}
              disabled={saving}
              onToggle={() => update({ emailEnabled: !prefs.emailEnabled })}
            />
            <Divider />
            <ToggleRow
              icon="calendar_today"
              iconClass="bg-primary-container/20 text-primary"
              label="Sync with Google Calendar"
              sublabel="Keep your schedule up to date automatically"
              checked={prefs.googleCalendarSyncEnabled}
              disabled={saving}
              onToggle={() => update({ googleCalendarSyncEnabled: !prefs.googleCalendarSyncEnabled })}
            />
            <Divider />
            <ToggleRow
              icon="event_repeat"
              iconClass="bg-tertiary-container/20 text-tertiary"
              label="Sync with Office365"
              sublabel="Connect your Outlook calendar and events"
              checked={prefs.office365SyncEnabled}
              disabled={saving}
              onToggle={() => update({ office365SyncEnabled: !prefs.office365SyncEnabled })}
            />
          </div>
          {pushError && (
            <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
              {pushError}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-label-md text-label-md text-primary uppercase tracking-wider pl-2">Categories</h2>
          <div className="bg-surface-container-low rounded-xl p-4 shadow-sm flex flex-col gap-4">
            <ToggleRow
              label="Calendar & Custody"
              sublabel="Handovers, events, schedule changes"
              checked={prefs.categoryCalendar}
              disabled={saving}
              onToggle={() => update({ categoryCalendar: !prefs.categoryCalendar })}
            />
            <Divider />
            <ToggleRow
              label="Journal & Media"
              sublabel="New memories and photos shared"
              checked={prefs.categoryJournal}
              disabled={saving}
              onToggle={() => update({ categoryJournal: !prefs.categoryJournal })}
            />
            <Divider />
            <ToggleRow
              label="Shared Lists"
              sublabel="Updates to necessities or wishlists"
              checked={prefs.categoryLists}
              disabled={saving}
              onToggle={() => update({ categoryLists: !prefs.categoryLists })}
            />
            <Divider />
            <ToggleRow
              label="Messages"
              sublabel="Direct messages or personal notes"
              checked={prefs.categoryMessages}
              disabled={saving}
              onToggle={() => update({ categoryMessages: !prefs.categoryMessages })}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-label-md text-label-md text-secondary uppercase tracking-wider pl-2">Quiet Hours</h2>
          <div className="bg-secondary-container/50 rounded-xl p-4 shadow-sm flex flex-col gap-4 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 text-secondary/10 w-24 h-24">
              <Icon name="bedtime" className="text-[96px]" />
            </div>
            <div className="flex items-start justify-between relative z-10">
              <div className="flex flex-col pr-8">
                <span className="font-label-md text-label-md text-on-secondary-container">Do Not Disturb</span>
                <span className="font-label-sm text-label-sm text-on-secondary-container/80 mt-1">
                  Silence non-emergency alerts during scheduled times to protect your downtime.
                </span>
              </div>
              <Toggle
                checked={prefs.doNotDisturb}
                disabled={saving}
                onColor="bg-secondary"
                onKnobColor="bg-on-secondary"
                offKnobColor="bg-on-surface-variant"
                onToggle={() => update({ doNotDisturb: !prefs.doNotDisturb })}
              />
            </div>
            <div
              className={`flex items-center gap-4 mt-2 relative z-10 transition-opacity duration-200 ${
                prefs.doNotDisturb ? "" : "opacity-50 pointer-events-none"
              }`}
            >
              <label className="flex-1 bg-surface rounded-lg p-3 flex flex-col shadow-sm cursor-pointer">
                <span className="font-label-sm text-label-sm text-on-surface-variant">From</span>
                <input
                  type="time"
                  value={prefs.quietHoursFrom}
                  onChange={(e) => update({ quietHoursFrom: e.target.value })}
                  disabled={saving || !prefs.doNotDisturb}
                  className="font-headline-md text-headline-md text-on-surface mt-1 bg-transparent outline-none w-full"
                />
              </label>
              <div className="text-on-secondary-container/50 font-bold">to</div>
              <label className="flex-1 bg-surface rounded-lg p-3 flex flex-col shadow-sm cursor-pointer">
                <span className="font-label-sm text-label-sm text-on-surface-variant">To</span>
                <input
                  type="time"
                  value={prefs.quietHoursTo}
                  onChange={(e) => update({ quietHoursTo: e.target.value })}
                  disabled={saving || !prefs.doNotDisturb}
                  className="font-headline-md text-headline-md text-on-surface mt-1 bg-transparent outline-none w-full"
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-[1px] w-full bg-surface-variant/50" />;
}

function ToggleRow({
  icon,
  iconClass,
  label,
  sublabel,
  checked,
  disabled,
  onToggle,
}: {
  icon?: string;
  iconClass?: string;
  label: string;
  sublabel: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {icon && (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconClass}`}>
            <Icon name={icon} />
          </div>
        )}
        <div className="flex flex-col">
          <span className="font-label-md text-label-md text-on-surface">{label}</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">{sublabel}</span>
        </div>
      </div>
      <Toggle
        checked={checked}
        disabled={disabled}
        onToggle={onToggle}
        offColor="bg-surface-variant"
        offKnobColor="bg-on-surface-variant"
      />
    </div>
  );
}
