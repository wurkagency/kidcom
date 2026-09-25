import { useState } from "react";
import { checkPassword, useT } from "@kinnd/core";

import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { VisibilityToggle } from "./AuthParts";

// New password + strength meter + rule checklist + confirmation, as in
// docs/design/aura/kinnd_reset_password. (The export's confirm field lost
// its <input> — only the eye toggle survived — so it is restored here with
// the new-password field's own styling.)

type Props = {
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  /** Set when the server rejected the password as recently used. */
  reusedRejected?: boolean;
};

const STRENGTH = [
  { key: "weak", bar: "w-1/3", tone: "bg-error", text: "text-error" }, // empty: the design's resting state
  { key: "weak", bar: "w-1/3", tone: "bg-error", text: "text-error" },
  { key: "fair", bar: "w-2/3", tone: "bg-secondary", text: "text-secondary" },
  { key: "strong", bar: "w-full", tone: "bg-primary", text: "text-primary" },
] as const;

function Rule({ met, failed, label }: { met: boolean; failed?: boolean; label: string }) {
  return (
    <div className={cn("flex items-center space-x-2.5", failed ? "text-error" : met ? "text-primary" : "text-secondary")}>
      <Icon
        name={failed ? "cancel" : met ? "check_circle" : "radio_button_unchecked"}
        filled={met || failed}
        className="text-[18px] transition-colors"
      />
      <span className="font-label-sm text-label-sm">{label}</span>
    </div>
  );
}

export function PasswordFields({ password, confirm, onPasswordChange, onConfirmChange, reusedRejected }: Props) {
  const { t } = useT("auth");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const check = checkPassword(password);
  const strength = STRENGTH[check.strength];
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <>
      <div className="flex flex-col space-y-1.5">
        <Label htmlFor="new-password" className="font-label-md text-label-md text-on-surface">
          {t("password.new")}
        </Label>
        <div className="relative flex items-center">
          <Input
            id="new-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder={t("password.newPlaceholder")}
            className="pr-12 focus:bg-surface-container-lowest focus:shadow-[0_0_0_2px_#000000]"
          />
          <VisibilityToggle visible={show} onToggle={() => setShow((v) => !v)} />
        </div>
      </div>

      <div className="flex flex-col space-y-2" aria-live="polite">
        <div className="flex justify-between items-center px-1">
          <span className="font-label-sm text-label-sm text-secondary">{t("password.strength")}</span>
          <span className={cn("font-label-sm text-label-sm", strength.text)}>{t(`password.strengthLevel.${strength.key}`)}</span>
        </div>
        <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden flex">
          <div className={cn("h-full transition-all duration-300 rounded-full", strength.bar, strength.tone)} />
        </div>
      </div>

      <div className="bg-surface-container-low p-3.5 flex flex-col space-y-2.5">
        <Rule met={check.length} label={t("password.ruleLength")} />
        <Rule met={check.numberOrSymbol} label={t("password.ruleNumberOrSymbol")} />
        <Rule met={false} failed={reusedRejected} label={t("password.ruleHistory")} />
      </div>

      <div className="flex flex-col space-y-1.5">
        <Label htmlFor="confirm-password" className="font-label-md text-label-md text-on-surface">
          {t("password.confirm")}
        </Label>
        <div className="relative flex items-center">
          <Input
            id="confirm-password"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => onConfirmChange(e.target.value)}
            placeholder={t("password.confirmPlaceholder")}
            aria-invalid={mismatch || undefined}
            className="pr-12 focus:bg-surface-container-lowest focus:shadow-[0_0_0_2px_#000000]"
          />
          <VisibilityToggle visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
        </div>
        {mismatch && <p className="px-4 font-label-sm text-label-sm text-error">{t("password.mismatch")}</p>}
      </div>
    </>
  );
}

/** True when the form may be submitted. */
export function passwordFormReady(password: string, confirm: string) {
  return checkPassword(password).valid && password === confirm;
}
