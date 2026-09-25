import { useState, type FormEvent } from "react";
import {
  DEFAULT_PHONE_COUNTRY,
  Link,
  PHONE_COUNTRIES,
  maskPhone,
  paths,
  toE164,
  useForgotPassword,
  useNavigate,
  useResetPassword,
  useSearchParams,
  useT,
} from "@kinnd/core";

import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { Checkbox } from "../ui/checkbox";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import {
  AuthBrand,
  AuthPage,
  BackToSignIn,
  ErrorBanner,
  IconField,
  SecurityShield,
  SubmitButton,
  SuccessBanner,
} from "./AuthParts";
import { CodeInput } from "./CodeEntry";
import { authErrorText, isErrorCode } from "./errors";
import { PasswordFields, passwordFormReady } from "./PasswordFields";
import { PhoneNumberField } from "./PhoneNumberField";

type Method = "email" | "sms";

// docs/design/aura/kinnd_forgot_password: choose email link or SMS code.
// The SMS option asks for the verified mobile number (per the export's
// script); the confirmation never reveals whether an account exists.
export function ForgotPasswordScreen() {
  const { t } = useT("auth");
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");
  const [countryIso, setCountryIso] = useState(DEFAULT_PHONE_COUNTRY.iso);
  const [number, setNumber] = useState("");
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [sentTo, setSentTo] = useState<{ method: Method; target: string } | null>(null);
  const forgot = useForgotPassword();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (method === "email") {
      forgot.mutate({ email }, { onSuccess: () => setSentTo({ method, target: email }) });
      return;
    }
    const country = PHONE_COUNTRIES.find((c) => c.iso === countryIso) ?? DEFAULT_PHONE_COUNTRY;
    const phone = toE164(country.dial, number);
    setPhoneInvalid(!phone);
    if (!phone) return;
    forgot.mutate({ method: "sms", phone }, { onSuccess: () => setSentTo({ method, target: phone }) });
  };

  const option = (value: Method, icon: string, title: string, subtitle: string) => (
    <label
      className={cn(
        "flex items-center p-3 cursor-pointer transition-colors",
        method === value ? "bg-surface-container-low active:bg-surface-container" : "bg-surface-bright active:bg-surface-container-low",
      )}
    >
      <RadioGroupItem value={value} className="shrink-0" />
      <div className="ml-3 flex items-center space-x-2.5 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
          <Icon name={icon} className="text-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-title-md text-title-md text-on-surface block truncate">{title}</span>
          <span className="font-label-sm text-label-sm text-secondary truncate block">{subtitle}</span>
        </div>
      </div>
    </label>
  );

  return (
    <AuthPage>
      <div className="flex flex-col items-center text-center mt-2 mb-6">
        <AuthBrand />
        <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight mb-2">{t("forgot.title")}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-[320px] mx-auto leading-relaxed">{t("forgot.subtitle")}</p>
      </div>

      <div className="w-full bg-surface-container-lowest rounded-lg p-6 shadow-md transition-all">
        <div className="mb-6">
          <h3 className="font-label-md text-label-md text-on-surface flex items-center gap-1.5 mb-3">
            <Icon name="send_to_mobile" className="text-[18px] text-on-surface-variant" />
            <span>{t("forgot.method")}</span>
          </h3>
          <RadioGroup
            value={method}
            onValueChange={(v) => {
              setMethod(v as Method);
              setSentTo(null);
              forgot.reset();
            }}
            className="space-y-2 mt-2 gap-0"
          >
            {option("email", "mail", t("forgot.emailOption"), t("forgot.emailOptionHint"))}
            {option("sms", "phone_iphone", t("forgot.smsOption"), t("forgot.smsOptionHint"))}
          </RadioGroup>
        </div>

        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            {method === "email" ? (
              <IconField
                id="recovery-input"
                type="email"
                label={t("forgot.emailLabel")}
                icon="mail"
                placeholder={t("signup.emailPlaceholder")}
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            ) : (
              <PhoneNumberField countryIso={countryIso} onCountryChange={setCountryIso} value={number} onChange={setNumber} invalid={phoneInvalid} />
            )}
            <p className="font-micro-meta text-micro-meta text-on-surface-variant px-2">
              {method === "email" ? t("forgot.emailHint") : t("forgot.smsHint")}
            </p>
          </div>
          {forgot.isError && <ErrorBanner>{authErrorText(forgot.error, t)}</ErrorBanner>}
          <button
            className="w-full h-12 rounded-full bg-primary text-on-primary font-label-md text-label-md flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-all select-none disabled:opacity-60"
            type="submit"
            disabled={forgot.isPending}
          >
            <span>
              {sentTo ? (method === "email" ? t("forgot.sent") : t("forgot.codeSent")) : method === "email" ? t("forgot.sendInstructions") : t("forgot.sendCode")}
            </span>
            <Icon name={forgot.isPending ? "progress_activity" : "arrow_forward"} className={cn("text-[18px]", forgot.isPending && "animate-spin")} />
          </button>
        </form>

        {sentTo && (
          <div className="mt-4 flex flex-col gap-4">
            <SuccessBanner title={sentTo.method === "email" ? t("forgot.checkInbox") : t("forgot.checkPhone")}>
              {sentTo.method === "email" ? t("forgot.checkInboxBody") : t("forgot.checkPhoneBody", { phone: maskPhone(sentTo.target) })}
            </SuccessBanner>
            {sentTo.method === "sms" && (
              <SubmitButton type="button" onClick={() => navigate(`${paths.auth.resetPassword()}?method=sms`)}>
                {t("forgot.enterCode")}
              </SubmitButton>
            )}
          </div>
        )}
      </div>

      <BackToSignIn onClick={() => navigate(paths.auth.login())} />
      <SecurityShield />
    </AuthPage>
  );
}

// docs/design/aura/kinnd_reset_password. Reached from the emailed link
// (?token=…) or after requesting an SMS code (?method=sms), which adds the
// code field. Success signs the user in.
export function ResetPasswordScreen() {
  const { t } = useT("auth");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  const viaSms = params.get("method") === "sms";
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const reset = useResetPassword();

  const [attempted, setAttempted] = useState(false);
  const ready = passwordFormReady(password, confirm) && (viaSms ? code.length === 6 : Boolean(token));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!ready) return;
    reset.mutate(
      { ...(viaSms ? { code } : { token: token! }), password, signOutOtherDevices: signOutOthers },
      { onSuccess: () => navigate(paths.today(), { replace: true }) },
    );
  };

  if (!token && !viaSms) {
    return (
      <AuthPage>
        <AuthBrand />
        <div className="flex flex-col gap-5">
          <ErrorBanner>{t("errors.RESET_LINK_INVALID")}</ErrorBanner>
          <Link
            to={paths.auth.forgotPassword()}
            className="w-full h-12 rounded-full bg-primary text-on-primary font-title-md text-title-md flex items-center justify-center gap-2 shadow-md"
          >
            {t("reset.requestNew")}
          </Link>
        </div>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <AuthBrand />
      <div className="text-center mb-6">
        <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight mb-2">{t("reset.title")}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-[320px] mx-auto leading-relaxed">{t("reset.subtitle")}</p>
      </div>
      <div className="bg-surface-container-lowest rounded-lg p-6 shadow-sm flex flex-col space-y-5">
        <form className="flex flex-col space-y-5" onSubmit={submit}>
          {viaSms && (
            <div className="flex flex-col space-y-2">
              <span className="font-label-md text-label-md text-on-surface">{t("reset.smsCode")}</span>
              <CodeInput value={code} onChange={setCode} onComplete={setCode} disabled={reset.isPending} />
            </div>
          )}
          <PasswordFields
            password={password}
            confirm={confirm}
            onPasswordChange={setPassword}
            onConfirmChange={setConfirm}
            reusedRejected={isErrorCode(reset.error, "PASSWORD_REUSED")}
          />
          <div className="pt-1">
            <label className="flex items-start space-x-3 cursor-pointer select-none">
              <Checkbox checked={signOutOthers} onCheckedChange={(v) => setSignOutOthers(v === true)} className="mt-0.5" />
              <div className="flex flex-col text-left">
                <span className="font-label-md text-label-md text-on-surface leading-tight">{t("reset.signOutOthers")}</span>
                <span className="font-body-md text-body-md text-secondary mt-0.5">{t("reset.signOutOthersHint")}</span>
              </div>
            </label>
          </div>
          {attempted && !ready && <ErrorBanner>{t("password.incomplete")}</ErrorBanner>}
          {reset.isError && <ErrorBanner>{authErrorText(reset.error, t)}</ErrorBanner>}
          <div className="pt-2">
            <button
              className="w-full h-12 rounded-full bg-primary text-on-primary font-title-md text-title-md flex items-center justify-center space-x-2 shadow-md hover:bg-primary-container active:scale-[0.99] transition-all disabled:opacity-60"
              type="submit"
              disabled={reset.isPending}
            >
              <span className="font-bold text-[13px]">{t("reset.submit")}</span>
              <Icon name={reset.isPending ? "progress_activity" : "arrow_forward"} className={cn("text-[18px]", reset.isPending && "animate-spin")} />
            </button>
          </div>
        </form>
      </div>
      <BackToSignIn onClick={() => navigate(paths.auth.login())} />
      <SecurityShield />
    </AuthPage>
  );
}
