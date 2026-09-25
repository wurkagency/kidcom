import { useState, type FormEvent, type ReactNode } from "react";
import {
  DEFAULT_PHONE_COUNTRY,
  LEGAL_URLS,
  Link,
  PHONE_COUNTRIES,
  paths,
  splitFullName,
  toE164,
  useCompleteOAuthSignup,
  useNavigate,
  usePendingOAuthSignup,
  useSearchParams,
  useSignup,
  useT,
} from "@kinnd/core";

import { Icon } from "../components/Icon";
import { Checkbox } from "../ui/checkbox";
import { AuthBrand, AuthPage, ErrorBanner, IconField, ProviderButtons } from "./AuthParts";
import { authErrorText } from "./errors";
import { PhoneNumberField } from "./PhoneNumberField";

// docs/design/aura/kinnd_sign_up. Name, email, mobile and consent; the
// password is created after the SMS step (see CreatePasswordScreen). The
// export's subtitle "Choose your role below" is dropped — the design has no
// role picker (roles are set per child, when a child is added).

function ConsentRow({
  id,
  checked,
  onChange,
  invalid,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 pt-2">
      <div className="relative flex items-center pt-0.5">
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-invalid={(invalid && !checked) || undefined} />
      </div>
      <label className="font-body-md text-body-md text-on-surface-variant leading-snug cursor-pointer select-none" htmlFor={id}>
        {children}
      </label>
    </div>
  );
}

function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="text-on-surface font-title-md underline decoration-secondary" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function SignupScreen() {
  const { t } = useT("auth");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const continuingOAuth = params.get("continue") === "oauth";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryIso, setCountryIso] = useState(DEFAULT_PHONE_COUNTRY.iso);
  const [phone, setPhone] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [phoneError, setPhoneError] = useState(false);
  const [consentError, setConsentError] = useState(false);

  const signup = useSignup();
  const pending = usePendingOAuthSignup(continuingOAuth);
  const completeOAuth = useCompleteOAuthSignup();
  const country = PHONE_COUNTRIES.find((c) => c.iso === countryIso) ?? DEFAULT_PHONE_COUNTRY;
  const consented = privacy && terms;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setConsentError(!consented);
    if (!consented) return;
    if (continuingOAuth) {
      completeOAuth.mutate(undefined, { onSuccess: () => navigate(paths.today(), { replace: true }) });
      return;
    }
    const e164 = toE164(country.dial, phone);
    setPhoneError(!e164);
    if (!e164) return;
    const { firstName, lastName } = splitFullName(fullName);
    signup.mutate(
      { firstName, lastName, email, phone: e164, acceptedTerms: true },
      { onSuccess: () => navigate(paths.auth.verifyPhone(), { replace: true }) },
    );
  };

  const error = signup.error ?? completeOAuth.error ?? (pending.data === null && continuingOAuth ? "expired" : null);

  return (
    <AuthPage>
      <AuthBrand />
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-on-surface mb-2 text-center">{t("signup.title")}</h1>
        <p className="text-sm text-secondary leading-relaxed max-w-[280px] mx-auto mb-6 text-center">{t("signup.subtitle")}</p>
      </div>

      <form
        onSubmit={submit}
        className="relative rounded-lg bg-surface-container-lowest/90 backdrop-blur-md p-6 shadow-sm mb-6 flex flex-col gap-5"
      >
        {error && (
          <ErrorBanner>{error === "expired" ? t("signup.oauthExpired") : authErrorText(error, t)}</ErrorBanner>
        )}
        {consentError && !consented && <ErrorBanner>{t("signup.consentRequired")}</ErrorBanner>}

        {continuingOAuth ? (
          pending.data && (
            <div className="flex items-center gap-3 rounded bg-surface-container-low p-3">
              <Icon name="account_circle" className="text-[28px] text-secondary" />
              <div className="min-w-0">
                <p className="font-title-md text-title-md text-on-surface truncate">
                  {`${pending.data.firstName} ${pending.data.lastName}`.trim()}
                </p>
                <p className="font-label-sm text-label-sm text-secondary truncate">
                  {t("signup.continuingWith", { provider: t(`providers.${pending.data.provider}`), email: pending.data.email })}
                </p>
              </div>
            </div>
          )
        ) : (
          <>
            <IconField
              id="fullName"
              label={t("signup.fullName")}
              icon="badge"
              placeholder={t("signup.fullNamePlaceholder")}
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <IconField
              id="email"
              type="email"
              label={t("signup.email")}
              icon="mail"
              placeholder={t("signup.emailPlaceholder")}
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <PhoneNumberField countryIso={countryIso} onCountryChange={setCountryIso} value={phone} onChange={setPhone} invalid={phoneError} />
          </>
        )}

        {/* The export reserves an empty block here (its "childrenSection"),
            which spaces the consent rows further from the fields. */}
        <div className="pt-1" aria-hidden="true" />
        <ConsentRow id="terms" checked={privacy} onChange={setPrivacy} invalid={consentError}>
          {t("signup.agreeTo")} <LegalLink href={LEGAL_URLS.privacy}>{t("signup.privacyPolicy")}</LegalLink>
        </ConsentRow>
        <ConsentRow id="terms2" checked={terms} onChange={setTerms} invalid={consentError}>
          {t("signup.agreeTo")} <LegalLink href={LEGAL_URLS.terms}>{t("signup.terms")}</LegalLink>
        </ConsentRow>

        <button
          className="w-full h-12 rounded-full bg-primary text-on-primary font-title-md text-[14px] shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          type="submit"
          disabled={signup.isPending || completeOAuth.isPending || (continuingOAuth && !pending.data)}
        >
          <span className="font-title-md text-[14px]">{continuingOAuth ? t("signup.continue") : t("signup.submit")}</span>
          <Icon name="arrow_forward" className="text-[18px]" />
        </button>
      </form>

      {!continuingOAuth && (
        <ProviderButtons
          label={t("signup.orJoinWith")}
          blocked={!consented}
          onBlocked={() => setConsentError(true)}
          acceptedTerms={consented}
        />
      )}

      <div className="flex items-center justify-center pb-2">
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t("signup.haveAccount")}{" "}
          <Link className="font-title-md text-title-md text-on-surface underline decoration-secondary underline-offset-2" to={paths.auth.login()}>
            {t("signup.logIn")}
          </Link>
        </p>
      </div>
    </AuthPage>
  );
}
