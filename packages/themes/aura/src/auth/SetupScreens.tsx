import { useEffect, useState, type FormEvent } from "react";
import {
  DEFAULT_PHONE_COUNTRY,
  Navigate,
  PHONE_COUNTRIES,
  maskPhone,
  paths,
  toE164,
  useCurrentUser,
  useLogout,
  useMe,
  useNavigate,
  useResendVerification,
  useSearchParams,
  useSendPhoneCode,
  useSetPassword,
  useT,
  useVerifyEmail,
  useVerifyPhone,
} from "@kidcom/core";

import { Icon } from "../components/Icon";
import { AuthBrand, AuthCard, AuthPage, AuthTitle, ErrorBanner, SecurityShield, SubmitButton, SuccessBanner } from "./AuthParts";
import { CodeInput, ResendCode } from "./CodeEntry";
import { authErrorText, isErrorCode } from "./errors";
import { PasswordFields, passwordFormReady } from "./PasswordFields";
import { PhoneNumberField } from "./PhoneNumberField";

// Account setup after signup: verify the mobile number (mandatory), create a
// password, confirm the email. No Stitch exports exist for these steps; they
// reuse the sage auth layout and the reset-password form.

function SignOutLink() {
  const { t } = useT("auth");
  const navigate = useNavigate();
  const logout = useLogout();
  return (
    <div className="mt-6 flex justify-center">
      <button
        type="button"
        onClick={() => logout.mutate(undefined, { onSettled: () => navigate(paths.auth.login(), { replace: true }) })}
        className="font-label-md text-label-md text-secondary hover:text-on-surface transition-colors py-2 px-4 rounded-full hover:bg-surface-container"
      >
        {t("setup.signOut")}
      </button>
    </div>
  );
}

export function PhoneVerifyScreen() {
  const { t } = useT("auth");
  const me = useCurrentUser();
  const [editing, setEditing] = useState(!me.pendingPhone);
  const [countryIso, setCountryIso] = useState(DEFAULT_PHONE_COUNTRY.iso);
  const [number, setNumber] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [code, setCode] = useState("");
  const send = useSendPhoneCode();
  const verify = useVerifyPhone();
  const { refetch } = useMe();

  const sendTo = (e: FormEvent) => {
    e.preventDefault();
    const country = PHONE_COUNTRIES.find((c) => c.iso === countryIso) ?? DEFAULT_PHONE_COUNTRY;
    const e164 = toE164(country.dial, number);
    setInvalid(!e164);
    if (!e164) return;
    send.mutate(e164, {
      onSuccess: () => {
        setEditing(false);
        setCode("");
        void refetch();
      },
    });
  };

  // A rejected code clears the boxes, ready for the next attempt.
  const submitCode = (value = code) => {
    if (value.length === 6) verify.mutate(value, { onError: () => setCode("") });
  };

  return (
    <AuthPage>
      <AuthBrand />
      {editing ? (
        <>
          <AuthTitle title={t("phone.addTitle")} subtitle={t("phone.addSubtitle")} />
          <AuthCard>
            <form className="flex flex-col gap-5" onSubmit={sendTo}>
              <PhoneNumberField countryIso={countryIso} onCountryChange={setCountryIso} value={number} onChange={setNumber} invalid={invalid} />
              {send.isError && <ErrorBanner>{authErrorText(send.error, t)}</ErrorBanner>}
              <SubmitButton pending={send.isPending}>{t("phone.sendCode")}</SubmitButton>
            </form>
          </AuthCard>
        </>
      ) : (
        <>
          <AuthTitle
            title={t("phone.verifyTitle")}
            subtitle={t("phone.verifySubtitle", { phone: me.pendingPhone ? maskPhone(me.pendingPhone) : "" })}
          />
          <AuthCard>
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                submitCode();
              }}
            >
              <CodeInput value={code} onChange={setCode} onComplete={submitCode} disabled={verify.isPending} invalid={verify.isError} />
              {verify.isError && <ErrorBanner>{authErrorText(verify.error, t)}</ErrorBanner>}
              <SubmitButton pending={verify.isPending} disabled={code.length !== 6}>
                {t("phone.verify")}
              </SubmitButton>
            </form>
            <ResendCode onResend={() => send.mutate(undefined)} pending={send.isPending} />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="self-center font-label-md text-label-md text-secondary underline decoration-secondary-container underline-offset-4 hover:text-on-surface"
            >
              {t("phone.changeNumber")}
            </button>
          </AuthCard>
        </>
      )}
      <SecurityShield />
      <SignOutLink />
    </AuthPage>
  );
}

export function CreatePasswordScreen() {
  const { t } = useT("auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [attempted, setAttempted] = useState(false);
  const setPasswordMutation = useSetPassword();
  const ready = passwordFormReady(password, confirm);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (ready) setPasswordMutation.mutate(password);
  };

  return (
    <AuthPage>
      <AuthBrand />
      <AuthTitle title={t("createPassword.title")} subtitle={t("createPassword.subtitle")} />
      <div className="bg-surface-container-lowest rounded-lg p-6 shadow-sm flex flex-col space-y-5">
        <form className="flex flex-col space-y-5" onSubmit={submit}>
          <PasswordFields
            password={password}
            confirm={confirm}
            onPasswordChange={setPassword}
            onConfirmChange={setConfirm}
            reusedRejected={isErrorCode(setPasswordMutation.error, "PASSWORD_REUSED")}
          />
          {attempted && !ready && <ErrorBanner>{t("password.incomplete")}</ErrorBanner>}
          {setPasswordMutation.isError && <ErrorBanner>{authErrorText(setPasswordMutation.error, t)}</ErrorBanner>}
          <div className="pt-2">
            <SubmitButton pending={setPasswordMutation.isPending}>
              {t("createPassword.submit")}
            </SubmitButton>
          </div>
        </form>
      </div>
      <SecurityShield />
      <SignOutLink />
    </AuthPage>
  );
}

/**
 * Both ends of email verification: the landing page for the emailed link
 * (?token=…), and the "check your inbox" step of account setup.
 */
export function VerifyEmailScreen() {
  const { t } = useT("auth");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  const { data: me, isPending: meLoading, refetch } = useMe();
  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const [sentAgain, setSentAgain] = useState(false);

  useEffect(() => {
    if (token && verify.isIdle) verify.mutate(token);
  }, [token, verify]);

  if (token) {
    return (
      <AuthPage>
        <AuthBrand />
        <AuthTitle title={t("verifyEmail.linkTitle")} />
        <AuthCard>
          {verify.isPending || verify.isIdle ? (
            <p role="status" className="text-center font-body-md text-body-md text-on-surface-variant">
              {t("verifyEmail.checking")}
            </p>
          ) : verify.isSuccess ? (
            <>
              <SuccessBanner title={t("verifyEmail.confirmedTitle")}>{t("verifyEmail.confirmedBody")}</SuccessBanner>
              <SubmitButton type="button" onClick={() => navigate(me ? paths.today() : paths.auth.login(), { replace: true })}>
                {me ? t("verifyEmail.continue") : t("recovery.signIn")}
              </SubmitButton>
            </>
          ) : (
            <>
              <ErrorBanner>{authErrorText(verify.error, t)}</ErrorBanner>
              <SubmitButton type="button" onClick={() => navigate(me ? paths.auth.verifyEmail() : paths.auth.login(), { replace: true })}>
                {me ? t("verifyEmail.requestNew") : t("recovery.signIn")}
              </SubmitButton>
            </>
          )}
        </AuthCard>
      </AuthPage>
    );
  }

  if (meLoading) return null;
  if (!me) return <Navigate to={paths.auth.login()} replace />;
  if (me.emailVerifiedAt) return <Navigate to={paths.today()} replace />;

  return (
    <AuthPage>
      <AuthBrand />
      <AuthTitle title={t("verifyEmail.inboxTitle")} subtitle={t("verifyEmail.inboxSubtitle", { email: me.email })} />
      <AuthCard>
        <div className="flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mint text-on-surface">
            <Icon name="mark_email_unread" className="text-[28px]" />
          </span>
        </div>
        {sentAgain && <SuccessBanner title={t("verifyEmail.sentAgain")} />}
        {resend.isError && <ErrorBanner>{authErrorText(resend.error, t)}</ErrorBanner>}
        <SubmitButton type="button" onClick={() => void refetch()}>
          {t("verifyEmail.done")}
        </SubmitButton>
        <button
          type="button"
          disabled={resend.isPending}
          onClick={() => resend.mutate(undefined, { onSuccess: () => setSentAgain(true) })}
          className="self-center font-label-md text-label-md text-secondary underline decoration-secondary-container underline-offset-4 hover:text-on-surface disabled:opacity-50"
        >
          {t("verifyEmail.resend")}
        </button>
      </AuthCard>
      <SignOutLink />
    </AuthPage>
  );
}
