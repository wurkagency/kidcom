import { useEffect, useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useT } from "@kinnd/core";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "../ui/input-otp";

/** Six-digit code input (shadcn InputOTP), submitting itself when complete. */
export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const { t } = useT("auth");
  return (
    <div className="flex justify-center">
      <InputOTP
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        aria-label={t("code.label")}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        disabled={disabled}
      >
        <InputOTPGroup>
          {Array.from({ length: 6 }, (_, i) => (
            <InputOTPSlot key={i} index={i} aria-invalid={invalid || undefined} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

const COOLDOWN_SECONDS = 30; // matches the API's resend cooldown

/** "Didn't get it? Resend code" with a countdown between sends. */
export function ResendCode({ onResend, pending }: { onResend: () => void; pending?: boolean }) {
  const { t } = useT("auth");
  const [remaining, setRemaining] = useState(COOLDOWN_SECONDS);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  return (
    <p className="text-center font-body-md text-body-md text-on-surface-variant">
      {t("code.notReceived")}{" "}
      {remaining > 0 ? (
        <span className="font-label-md text-label-md text-secondary">{t("code.resendIn", { seconds: remaining })}</span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            onResend();
            setRemaining(COOLDOWN_SECONDS);
          }}
          className="font-title-md text-title-md text-on-surface underline decoration-secondary underline-offset-2 disabled:opacity-50"
        >
          {t("code.resend")}
        </button>
      )}
    </p>
  );
}
