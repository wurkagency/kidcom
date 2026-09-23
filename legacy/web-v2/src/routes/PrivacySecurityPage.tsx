import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Icon } from "../components/Icon";
import { apiFetch, apiGet, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useHeaderConfig } from "../lib/HeaderContext";
import {
  getBiometricLoginEnabled,
  getJournalVisibility,
  getLocationAccess,
  getPhotoLibraryAccess,
  setBiometricLoginEnabled,
  setLocationAccess,
  setPhotoLibraryAccess,
} from "../lib/preferences";

// Matches docs/stitch_splitkid/privacy_security/code.html row-for-row.
// Change Password, Child Profile Permissions, Export My Data, and Delete
// Account are real account operations. Biometric Login, Journal Entry
// Visibility, Location Access, and Photo Library Access are real, persisted
// toggles (see lib/preferences.ts) — nothing in the app enforces them yet
// (no per-post visibility ACL, no native permission system to gate), which
// is stated plainly below rather than with a full disclaimer, per Charlie's
// instruction to match this screen exactly and wire up enforcement later.
// Two-Factor Authentication is NOT one of those decorative toggles — real
// email-OTP 2FA is unconditional on every login now, so this row is a
// static "Always on" indicator rather than a switch (there's nothing to
// turn off).
export function PrivacySecurityPage() {
  useHeaderConfig({ title: "Privacy & Security", backTo: "/profile" }, []);
  const navigate = useNavigate();
  const { children, refresh } = useAuth();

  const [biometric, setBiometric] = useState(() => getBiometricLoginEnabled());
  const [journalVisibility] = useState(() => getJournalVisibility());
  const [locationAccess, setLocationAccessState] = useState(() => getLocationAccess());
  const [photoAccess, setPhotoAccessState] = useState(() => getPhotoLibraryAccess());

  return (
    <div className="px-container-padding pt-4 flex flex-col gap-6 pb-8">
      <div className="flex flex-col gap-4">
        <h2 className="font-headline-md text-headline-md text-secondary">Account Security</h2>
        <div className="flex flex-col bg-surface-container rounded-xl overflow-hidden shadow-sm">
          <ChangePasswordCard />
          <div className="w-full h-px bg-surface-variant" />
          <div className="flex items-center justify-between p-4 bg-surface-container w-full">
            <div className="flex items-center gap-3">
              <Icon name="verified_user" className="text-primary" />
              <div className="flex flex-col">
                <span className="font-label-md text-label-md text-on-surface">Two-Factor Authentication</span>
                <span className="font-body-md text-body-md text-on-surface-variant text-sm">
                  A one-time code is emailed to you at every login
                </span>
              </div>
            </div>
            <span className="font-label-md text-label-md text-primary bg-primary/10 px-3 py-1 rounded-full">
              Always on
            </span>
          </div>
          <div className="w-full h-px bg-surface-variant" />
          <ToggleRow
            icon="fingerprint"
            label="Biometric Login"
            description="Use Face ID or Touch ID"
            checked={biometric}
            onChange={(v) => {
              setBiometric(v);
              setBiometricLoginEnabled(v);
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-headline-md text-headline-md text-secondary">Visibility &amp; Sharing</h2>
        <div className="flex flex-col bg-surface-container rounded-xl overflow-hidden shadow-sm">
          {children.length > 0 ? (
            <Link
              to={`/children/${children[0].id}`}
              className="flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors text-left w-full group"
            >
              <div className="flex items-center gap-3">
                <Icon name="group" className="text-primary" />
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface">Child Profile Permissions</span>
                  <span className="font-body-md text-body-md text-on-surface-variant text-sm">
                    Manage who can see the profile
                  </span>
                </div>
              </div>
              <Icon name="chevron_right" className="text-outline" />
            </Link>
          ) : (
            <div className="p-4">
              <p className="font-body-md text-body-md text-on-surface-variant text-sm">
                Add a child to manage who can see their profile.
              </p>
            </div>
          )}
          <div className="w-full h-px bg-surface-variant" />
          <button
            onClick={() => navigate("/security/journal-visibility")}
            className="flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors text-left w-full group"
          >
            <div className="flex items-center gap-3">
              <Icon name="visibility" className="text-primary group-hover:text-primary-container transition-colors" />
              <div className="flex flex-col">
                <span className="font-label-md text-label-md text-on-surface">Journal Entry Visibility</span>
                <span className="font-body-md text-body-md text-on-surface-variant text-sm">
                  Default setting for new entries · {journalVisibility === "shared" ? "Shared" : "Private"}
                </span>
              </div>
            </div>
            <Icon name="chevron_right" className="text-outline" />
          </button>
        </div>
        <p className="font-body-md text-[13px] text-on-surface-variant px-1">
          Not enforced yet — every journal entry is currently visible to everyone with access to the tagged child.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-headline-md text-headline-md text-secondary">App Permissions</h2>
        <div className="flex flex-col bg-surface-container rounded-xl overflow-hidden shadow-sm">
          <ToggleRow
            icon="location_on"
            label="Location Access"
            description="Required for map features"
            checked={locationAccess}
            onChange={(v) => {
              setLocationAccessState(v);
              setLocationAccess(v);
            }}
          />
          <div className="w-full h-px bg-surface-variant" />
          <ToggleRow
            icon="photo_library"
            label="Photo Library Access"
            description="Required to upload photos"
            checked={photoAccess}
            onChange={(v) => {
              setPhotoAccessState(v);
              setPhotoLibraryAccess(v);
            }}
          />
        </div>
        <p className="font-body-md text-[13px] text-on-surface-variant px-1">
          Not enforced yet — KidCom doesn't gate any feature on these today.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-headline-md text-headline-md text-secondary">Data Privacy</h2>
        <div className="flex flex-col gap-3">
          <ExportDataButton />
          <DeleteAccountButton onDeleted={() => { refresh(); navigate("/welcome", { replace: true }); }} />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-surface-container w-full">
      <div className="flex items-center gap-3">
        <Icon name={icon} className="text-primary" />
        <div className="flex flex-col">
          <span className="font-label-md text-label-md text-on-surface">{label}</span>
          <span className="font-body-md text-body-md text-on-surface-variant text-sm">{description}</span>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full relative transition-colors ${checked ? "bg-primary" : "bg-surface-variant"}`}
      >
        <div
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white border border-outline transition-transform ${
            checked ? "translate-x-full" : ""
          }`}
        />
      </button>
    </div>
  );
}

function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch<void>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't change your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors text-left w-full group"
      >
        <div className="flex items-center gap-3">
          <Icon name="password" className="text-primary" />
          <div className="flex flex-col">
            <span className="font-label-md text-label-md text-on-surface">Change Password</span>
            <span className="font-body-md text-body-md text-on-surface-variant text-sm">
              Update your current password
            </span>
          </div>
        </div>
        <Icon name={open ? "expand_less" : "chevron_right"} className="text-outline" />
      </button>
      {open && (
        <form onSubmit={handleSubmit} className="p-4 pt-0 flex flex-col gap-3 border-t border-surface-variant">
          <input
            type="password"
            required
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary mt-3"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="New password (min 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
          {error && <p className="font-body-md text-body-md text-error">{error}</p>}
          {success && <p className="font-body-md text-body-md text-primary">Password updated.</p>}
          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-on-primary font-label-md text-label-md py-3 rounded-full disabled:opacity-60"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </>
  );
}

function ExportDataButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiGet<unknown>("/auth/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "kidcom-data-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't export your data");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleExport}
        disabled={busy}
        className="w-full bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed-dim transition-colors font-label-md text-label-md py-3 rounded-full flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Icon name="download" />
        {busy ? "Preparing export…" : "Export My Data"}
      </button>
      {error && <p className="font-body-md text-body-md text-error">{error}</p>}
    </div>
  );
}

function DeleteAccountButton({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<void>("/auth/me", { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't delete your account");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-alert-soft-red/20 text-error hover:bg-alert-soft-red/30 transition-colors font-label-md text-label-md py-3 rounded-full flex items-center justify-center gap-2"
      >
        <Icon name="delete_forever" />
        Delete Account
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <div className="w-full max-w-md bg-surface rounded-t-2xl p-container-padding flex flex-col gap-4 pb-safe">
            <h3 className="font-headline-md text-headline-md text-on-surface">Delete your account?</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              This permanently removes your profile, journal posts, notes, and access to any children — it can't
              be undone. Type <span className="font-label-md text-error">DELETE</span> to confirm.
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-error"
            />
            {error && <p className="font-body-md text-body-md text-error">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setOpen(false);
                  setConfirmText("");
                }}
                className="flex-1 py-3 rounded-full bg-surface-container text-on-surface font-label-md text-label-md"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || busy}
                className="flex-1 py-3 rounded-full bg-error text-on-error font-label-md text-label-md disabled:opacity-60"
              >
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
