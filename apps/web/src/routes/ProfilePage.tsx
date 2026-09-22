import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { MeResponse, SubscriptionDto, UpdateProfileRequest } from "@kidcom/shared";

import { AvatarUpload } from "../components/AvatarUpload";
import { Icon } from "../components/Icon";
import { apiFetch, apiGet, apiPatch, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Matches docs/stitch_splitkid/account_settings/code.html: avatar + name +
// email header (with an inline edit affordance — the mockup only shows the
// avatar's edit pencil, so name/email editing reuses this codebase's own
// established "tap to expand a small form in place" pattern from
// PrivacySecurityPage's ChangePasswordCard), a real Subscription Plan card,
// Preferences (Notifications/Privacy & Security/App Settings) and Support
// (Help Center/Contact Us) sections, Log Out, and an app-version line. The
// old Children list + Family Tools grid are gone from this screen — children
// are already reachable from Home (its own child switcher + "Add a child"),
// and Messages already has its own persistent entry point (the bell icon in
// Header.tsx), so nothing here is stranded.
const APP_VERSION = "0.1.0";

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
      await refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex flex-col w-full pb-8">
      {user && (
        <div className="px-container-padding pt-section-margin pb-element-gap flex flex-col items-center">
          <AvatarUpload
            currentAssetId={user.avatarUrl}
            fallbackLetter={user.firstName.charAt(0)}
            size="lg"
            onUploaded={async (newAssetId) => {
              await apiPatch("/auth/me", { avatarMediaAssetId: newAssetId } satisfies UpdateProfileRequest);
              await refresh();
            }}
          />
          <EditableIdentity />
        </div>
      )}

      <div className="px-container-padding flex flex-col gap-element-gap">
        <SubscriptionCard />

        <SectionCard title="Preferences">
          <NavRow to="/notifications" icon="notifications" label="Notifications" />
          <Divider />
          <NavRow to="/security" icon="lock" label="Privacy & Security" />
          <Divider />
          <NavRow to="/preferences" icon="tune" label="App Settings" />
        </SectionCard>

        <SectionCard title="Support">
          <ExternalRow href="https://splitkid.com/help" icon="help" label="Help Center" />
          <Divider />
          <ExternalRow href="mailto:support@splitkid.com" icon="mail" label="Contact Us" />
        </SectionCard>

        <div className="pt-section-margin pb-element-gap flex flex-col items-center gap-4">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center justify-center gap-2 bg-error-container/50 text-on-error-container font-label-md text-label-md py-4 rounded-full transition-colors active:scale-[0.98] disabled:opacity-60"
          >
            <Icon name="logout" />
            {loggingOut ? "Logging out…" : "Log Out"}
          </button>
          <p className="text-center font-body-md text-[12px] leading-[16px] text-on-surface-variant">
            App Version {APP_VERSION}
          </p>
        </div>
      </div>
    </div>
  );
}

// Name + email, with a small edit icon that expands the same fields into an
// inline form — mirrors PrivacySecurityPage.tsx's ChangePasswordCard pattern
// (tap to expand, submit, collapse) rather than inventing a new route no
// mockup covers.
function EditableIdentity() {
  const { user, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyNotice, setVerifyNotice] = useState(false);

  useEffect(() => {
    if (!open && user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setEmail(user.email);
    }
  }, [open, user]);

  if (!user) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setVerifyNotice(false);
    try {
      const wasVerified = Boolean(user!.emailVerifiedAt);
      const res = await apiPatch<MeResponse>("/auth/me", {
        firstName,
        lastName,
        email,
      } satisfies UpdateProfileRequest);
      await refresh();
      if (wasVerified && res.user && !res.user.emailVerifiedAt) {
        setVerifyNotice(true);
      } else {
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save your changes");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center gap-1 mt-4 group"
      >
        <span className="flex items-center gap-1.5">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            {user.firstName} {user.lastName}
          </h2>
          <Icon name="edit" className="text-outline text-[16px] group-hover:text-primary transition-colors" />
        </span>
        <p className="font-body-md text-body-md text-on-surface-variant">{user.email}</p>
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm mt-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          required
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary text-center"
        />
        <input
          required
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary text-center"
        />
      </div>
      <input
        required
        type="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary text-center"
      />
      {error && <p className="font-body-md text-body-md text-error text-center">{error}</p>}
      {verifyNotice && (
        <p className="font-body-md text-body-md text-primary text-center">
          Saved — check your inbox to verify your new email address.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 py-3 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex-1 py-3 rounded-full bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// Real tier + next billing date from the same /billing/status endpoint
// BillingPage.tsx uses — "Manage" just links there.
function SubscriptionCard() {
  const [sub, setSub] = useState<SubscriptionDto | null>(null);

  useEffect(() => {
    apiGet<SubscriptionDto>("/billing/status")
      .then(setSub)
      .catch(() => setSub(null));
  }, []);

  const tierLabel = sub ? sub.tier.charAt(0) + sub.tier.slice(1).toLowerCase() : "—";
  const nextBilling = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : null;

  return (
    <div className="bg-surface-container-low rounded-xl p-element-gap shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-container/20 flex items-center justify-center text-primary">
            <Icon name="workspace_premium" />
          </div>
          <div>
            <h3 className="font-label-md text-label-md text-on-surface">Subscription Plan</h3>
            <p className="font-body-md text-[14px] leading-[20px] text-on-surface-variant">{tierLabel}</p>
          </div>
        </div>
        <Link
          to="/billing"
          className="font-label-md text-label-md text-primary bg-primary/10 px-3 py-1.5 rounded-full"
        >
          Manage
        </Link>
      </div>
      {nextBilling && (
        <>
          <div className="h-[1px] w-full bg-surface-container-highest my-3" />
          <div className="flex items-center justify-between">
            <p className="font-body-md text-[14px] leading-[20px] text-on-surface-variant">
              Next billing date: <span className="font-medium text-on-surface">{nextBilling}</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function SectionCard({ title, children: rows }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <h3 className="font-label-md text-label-md text-on-surface-variant px-element-gap pt-element-gap pb-2 uppercase tracking-wider">
        {title}
      </h3>
      {rows}
    </div>
  );
}

function NavRow({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <Link
      to={to}
      className="w-full flex items-center justify-between p-element-gap hover:bg-surface-container-low transition-colors text-left"
    >
      <div className="flex items-center gap-3">
        <Icon name={icon} className="text-on-surface-variant" />
        <span className="font-body-md text-body-md text-on-surface">{label}</span>
      </div>
      <Icon name="chevron_right" className="text-on-surface-variant" />
    </Link>
  );
}

function ExternalRow({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      target={href.startsWith("mailto:") ? undefined : "_blank"}
      rel={href.startsWith("mailto:") ? undefined : "noreferrer"}
      className="w-full flex items-center justify-between p-element-gap hover:bg-surface-container-low transition-colors text-left"
    >
      <div className="flex items-center gap-3">
        <Icon name={icon} className="text-on-surface-variant" />
        <span className="font-body-md text-body-md text-on-surface">{label}</span>
      </div>
      <Icon name="chevron_right" className="text-on-surface-variant" />
    </a>
  );
}

function Divider() {
  return <div className="w-full h-px bg-surface-variant" />;
}
