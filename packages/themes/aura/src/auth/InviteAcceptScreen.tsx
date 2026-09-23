import { useState, type FormEvent } from "react";
import { Link, paths, useAcceptInvite, useAcceptInviteAsMe, useInvitePreview, useMe, useNavigate, useParams, useT } from "@kidcom/core";

import { AuthBrand, AuthCard, AuthPage, AuthTitle, ErrorBanner, IconField, SecurityShield, SubmitButton } from "./AuthParts";
import { authErrorText } from "./errors";
import { PasswordFields, passwordFormReady } from "./PasswordFields";

// An invite link (no Stitch export; built from the sign-up screen's parts).
// Signed in already: add the child to this account. New to KidCom: name and
// password here, then the mobile number is verified like any sign-up.

export function InviteAcceptScreen() {
  const { t } = useT("auth");
  const { token = "" } = useParams();
  const { data: invite, isLoading } = useInvitePreview(token);
  const { data: me } = useMe();

  return (
    <AuthPage>
      <AuthBrand />
      {isLoading || !invite ? null : !invite.valid ? (
        <>
          <AuthTitle title={t(invite.reason === "already_accepted" ? "invite.usedTitle" : "invite.invalidTitle")} subtitle={t("invite.invalidSubtitle")} />
          <Link to={paths.auth.login()} className="self-center font-label-md text-label-md text-on-surface underline underline-offset-4">
            {t("invite.toSignIn")}
          </Link>
        </>
      ) : (
        <>
          <AuthTitle
            title={invite.childName ? t("invite.title", { name: invite.childName }) : t("invite.titleNoChild")}
            subtitle={t("invite.subtitle", { inviter: invite.inviterName ?? "", relationship: invite.relationship ? t(`children:relationship.${invite.relationship}`) : "" })}
          />
          {me ? <AcceptAsMe token={token} /> : invite.userExists ? <SignInFirst token={token} /> : <NewAccount token={token} email={invite.email} />}
        </>
      )}
      <SecurityShield />
    </AuthPage>
  );
}

function AcceptAsMe({ token }: { token: string }) {
  const { t } = useT("auth");
  const navigate = useNavigate();
  const accept = useAcceptInviteAsMe(token);
  return (
    <AuthCard>
      <p className="font-body-md text-body-md text-secondary">{t("invite.asMe")}</p>
      {accept.isError && <ErrorBanner>{authErrorText(accept.error, t)}</ErrorBanner>}
      <SubmitButton type="button" pending={accept.isPending} onClick={() => accept.mutate(undefined, { onSuccess: () => navigate(paths.children.overview(), { replace: true }) })}>
        {t("invite.accept")}
      </SubmitButton>
    </AuthCard>
  );
}

function SignInFirst({ token }: { token: string }) {
  const { t } = useT("auth");
  return (
    <AuthCard>
      <p className="font-body-md text-body-md text-secondary">{t("invite.hasAccount")}</p>
      <Link
        to={`${paths.auth.login()}?next=${encodeURIComponent(`/invite/${token}`)}`}
        className="w-full py-3.5 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-md text-label-md font-medium"
      >
        {t("invite.signInToAccept")}
      </Link>
    </AuthCard>
  );
}

function NewAccount({ token, email: invitedEmail }: { token: string; email: string | null }) {
  const { t } = useT("auth");
  const navigate = useNavigate();
  const accept = useAcceptInvite(token);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [attempted, setAttempted] = useState(false);
  const ready = firstName.trim() && lastName.trim() && (invitedEmail || email.trim()) && passwordFormReady(password, confirm);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!ready) return;
    accept.mutate(
      { firstName: firstName.trim(), lastName: lastName.trim(), password, ...(invitedEmail ? {} : { email: email.trim() }) },
      { onSuccess: () => navigate(paths.today(), { replace: true }) },
    );
  };

  return (
    <AuthCard>
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <div className="grid grid-cols-2 gap-3">
          <IconField id="first" label={t("invite.firstName")} icon="person" value={firstName} autoComplete="given-name" onChange={(e) => setFirstName(e.target.value)} />
          <IconField id="last" label={t("invite.lastName")} icon="person" value={lastName} autoComplete="family-name" onChange={(e) => setLastName(e.target.value)} />
        </div>
        {invitedEmail ? (
          <p className="font-body-md text-body-md text-secondary">{t("invite.asEmail", { email: invitedEmail })}</p>
        ) : (
          <IconField id="email" type="email" label={t("invite.email")} icon="mail" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
        )}
        <PasswordFields password={password} confirm={confirm} onPasswordChange={setPassword} onConfirmChange={setConfirm} />
        {attempted && !ready && <ErrorBanner>{t("invite.incomplete")}</ErrorBanner>}
        {accept.isError && <ErrorBanner>{authErrorText(accept.error, t)}</ErrorBanner>}
        <SubmitButton pending={accept.isPending}>{t("invite.join")}</SubmitButton>
      </form>
    </AuthCard>
  );
}
