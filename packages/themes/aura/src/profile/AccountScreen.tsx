import { useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  accountExportUrl,
  maskPhone,
  paths,
  toE164,
  useCurrentUser,
  useDeleteAccount,
  useNavigate,
  useSendPhoneCode,
  useT,
  useUpdateProfile,
  useUploadMedia,
  useVerifyPhone,
} from "@kinnd/core";

import { CodeInput, ResendCode } from "../auth/CodeEntry";
import { authErrorText } from "../auth/errors";
import { PhoneNumberField } from "../auth/PhoneNumberField";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorTitle, Field, FormCard, FormError, PrimaryButton, SecondaryButton } from "../components/Form";
import { Icon } from "../components/Icon";
import { MenuButton, MenuGroup, MenuLink } from "../components/MenuList";
import { PersonAvatar } from "../components/PersonAvatar";
import { Input } from "../ui/input";

// Account (no Stitch export; DESIGN.md form parts): photo, name, email, the
// verified mobile number (a new one takes effect only once its SMS code is
// confirmed), your data, and deleting the account.

export function AccountScreen() {
  const { t } = useT("profile");
  const me = useCurrentUser();
  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <EditorTitle>{t("account")}</EditorTitle>
      <ProfileCard key={`${me.firstName}|${me.lastName}|${me.email}`} />
      <PhoneCard />
      <MenuGroup title={t("security.title")}>
        <MenuLink to={paths.preferences.security()} icon="lock" label={t("security.password")} hint={t("security.passwordHint")} />
      </MenuGroup>
      <MenuGroup title={t("data.title")}>
        <a href={accountExportUrl()} download="kinnd-export.json" className="w-full flex items-center justify-between gap-3 p-3.5 hover:bg-surface-container/50 transition-colors">
          <span className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center">
              <Icon name="download" className="text-[19px]" />
            </span>
            <span className="flex flex-col">
              <span className="font-label-md text-label-md text-on-surface">{t("data.export")}</span>
              <span className="font-micro-meta text-micro-meta text-secondary font-medium tracking-normal">{t("data.exportHint")}</span>
            </span>
          </span>
        </a>
        <DeleteAccountRow />
      </MenuGroup>
    </div>
  );
}

function ProfileCard() {
  const { t } = useT("profile");
  const me = useCurrentUser();
  const update = useUpdateProfile();
  const upload = useUploadMedia();
  const fileInput = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(me.firstName);
  const [lastName, setLastName] = useState(me.lastName);
  const [email, setEmail] = useState(me.email);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = firstName.trim() !== me.firstName || lastName.trim() !== me.lastName || email.trim().toLowerCase() !== me.email;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) return setError(t("profileCard.nameRequired"));
    update.mutate(
      {
        ...(firstName.trim() !== me.firstName ? { firstName: firstName.trim() } : {}),
        ...(lastName.trim() !== me.lastName ? { lastName: lastName.trim() } : {}),
        ...(email.trim().toLowerCase() !== me.email ? { email: email.trim() } : {}),
      },
      { onSuccess: () => setSaved(true), onError: (err) => setError(authErrorText(err, (k) => t(`auth:${k}`))) },
    );
  };

  const photo = (file: File | undefined) => {
    if (!file) return;
    upload.mutate(file, { onSuccess: (asset) => update.mutate({ avatarMediaAssetId: asset.id }) });
  };

  return (
    <form onSubmit={submit} noValidate>
      <FormCard>
        <div className="flex items-center gap-4">
          <button type="button" aria-label={t("profileCard.photo")} onClick={() => fileInput.current?.click()} className="relative shrink-0">
            <PersonAvatar mediaId={me.avatarUrl} initials={`${me.firstName.charAt(0)}${me.lastName.charAt(0)}`} className="w-16 h-16" />
            <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-sm">
              <Icon name={upload.isPending ? "hourglass_top" : "photo_camera"} className="text-[15px]" />
            </span>
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => photo(e.target.files?.[0])} />
          <p className="font-body-md text-body-md text-secondary">{t("profileCard.photoHint")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="first" label={t("profileCard.firstName")}>
            <Input id="first" value={firstName} maxLength={80} autoComplete="given-name" onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field id="last" label={t("profileCard.lastName")}>
            <Input id="last" value={lastName} maxLength={80} autoComplete="family-name" onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <Field id="email" label={t("profileCard.email")} hint={me.emailVerifiedAt ? t("profileCard.verified") : t("profileCard.unverified")}>
          <Input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <FormError message={error} />
        {saved && !dirty && <p className="font-label-sm text-label-sm text-secondary">{t("profileCard.saved")}</p>}
        {dirty && (
          <PrimaryButton icon="check" disabled={update.isPending}>
            {t("profileCard.save")}
          </PrimaryButton>
        )}
      </FormCard>
    </form>
  );
}

function PhoneCard() {
  const { t } = useT("profile");
  const me = useCurrentUser();
  const send = useSendPhoneCode();
  const verify = useVerifyPhone();
  const [step, setStep] = useState<"view" | "number" | "code">(me.pendingPhone ? "code" : "view");
  const [countryIso, setCountryIso] = useState(DEFAULT_PHONE_COUNTRY.iso);
  const [number, setNumber] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [code, setCode] = useState("");
  const tAuth = (k: string) => t(`auth:${k}`);

  const sendTo = (e: FormEvent) => {
    e.preventDefault();
    const country = PHONE_COUNTRIES.find((c) => c.iso === countryIso) ?? DEFAULT_PHONE_COUNTRY;
    const e164 = toE164(country.dial, number);
    setInvalid(!e164);
    if (e164) send.mutate(e164, { onSuccess: () => (setStep("code"), setCode("")) });
  };
  const submitCode = (value = code) => {
    if (value.length === 6) verify.mutate(value, { onSuccess: () => setStep("view"), onError: () => setCode("") });
  };

  return (
    <section className="flex flex-col gap-space-xs">
      <h2 className="px-1 font-title-md text-title-md text-on-surface">{t("phone.title")}</h2>
      <FormCard>
        {step === "view" && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-title-md text-title-md text-on-surface">{me.phone ? maskPhone(me.phone) : t("phone.none")}</span>
              <span className="font-label-sm text-label-sm text-secondary">{t("phone.hint")}</span>
            </div>
            <SecondaryButton type="button" icon="edit" className="w-auto px-4" onClick={() => setStep("number")}>
              {t("phone.change")}
            </SecondaryButton>
          </div>
        )}
        {step === "number" && (
          <form onSubmit={sendTo} className="flex flex-col gap-4">
            <p className="font-body-md text-body-md text-secondary">{t("phone.newHint")}</p>
            <PhoneNumberField countryIso={countryIso} onCountryChange={setCountryIso} value={number} onChange={setNumber} invalid={invalid} />
            {send.isError && <FormError message={authErrorText(send.error, tAuth)} />}
            <PrimaryButton icon="sms" disabled={send.isPending}>
              {t("phone.sendCode")}
            </PrimaryButton>
            <button type="button" onClick={() => setStep("view")} className="self-center font-label-md text-label-md text-secondary underline underline-offset-4">
              {t("phone.cancel")}
            </button>
          </form>
        )}
        {step === "code" && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitCode();
            }}
          >
            <p className="font-body-md text-body-md text-secondary">{t("phone.codeHint", { phone: me.pendingPhone ? maskPhone(me.pendingPhone) : "" })}</p>
            <CodeInput value={code} onChange={setCode} onComplete={submitCode} disabled={verify.isPending} invalid={verify.isError} />
            {verify.isError && <FormError message={authErrorText(verify.error, tAuth)} />}
            <PrimaryButton icon="check" disabled={verify.isPending || code.length !== 6}>
              {t("phone.verify")}
            </PrimaryButton>
            <ResendCode onResend={() => send.mutate(undefined)} pending={send.isPending} />
          </form>
        )}
      </FormCard>
    </section>
  );
}

function DeleteAccountRow() {
  const { t } = useT("profile");
  const navigate = useNavigate();
  const remove = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState<string[] | null>(null);

  const confirm = () =>
    remove.mutate(undefined, {
      onSuccess: () => navigate(paths.auth.login(), { replace: true }),
      onError: (err) => {
        setOpen(false);
        const children = err instanceof ApiError && err.code === "LAST_GUARDIAN" ? (err.body as { details?: { children?: { firstName: string }[] } })?.details?.children : null;
        setBlocked(children ? children.map((c) => c.firstName) : []);
      },
    });

  return (
    <>
      <MenuButton icon="delete_forever" danger label={t("delete.title")} hint={t("delete.hint")} onClick={() => setOpen(true)} />
      {blocked && (
        <div className="px-3.5 pb-3.5">
          <FormError message={blocked.length ? t("delete.blocked", { names: blocked.join(", ") }) : t("delete.failed")} />
        </div>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("delete.confirmTitle")}
        body={t("delete.confirmBody")}
        confirmLabel={t("delete.confirm")}
        onConfirm={confirm}
        pending={remove.isPending}
      />
    </>
  );
}
