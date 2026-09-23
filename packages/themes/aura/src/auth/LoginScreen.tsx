import { useState, type FormEvent } from "react";
import { Link, oauthStartUrl, paths, safeNextPath, useLogin, useNavigate, useSearchParams, useT } from "@kidcom/core";

import heroPhoto from "../assets/auth-hero.jpg";
import { BrandMark, GoogleLogo, MicrosoftLogo } from "../components/BrandMark";
import { Icon } from "../components/Icon";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { ErrorBanner } from "./AuthParts";
import { authErrorText } from "./errors";

// docs/design/aura/kidcom_login — photographic layout, ported class for class.

const OAUTH_ERRORS = ["cancelled", "expired", "account_exists", "no_email", "unavailable"] as const;

const fieldClass =
  "w-full bg-surface-container-low text-on-surface font-body-md text-body-md rounded-full pl-11 py-3 placeholder:text-outline outline-none transition-all duration-200 focus:bg-surface-container-lowest focus:shadow-md border border-outline/20";

export function LoginScreen() {
  const { t } = useT("auth");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const oauthError = OAUTH_ERRORS.find((e) => e === params.get("oauthError"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const login = useLogin();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password, rememberMe },
      {
        onSuccess: () =>
          navigate(`${paths.auth.twoFactor()}?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ""}`),
      },
    );
  };

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen relative flex flex-col justify-between selection:bg-secondary-container selection:text-on-secondary-fixed">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <img src={heroPhoto} alt="" className="absolute inset-0 w-full h-full object-cover object-center z-0" />
        <div className="absolute inset-0 bg-gradient-to-b from-surface/30 via-surface/40 to-surface/90 z-0 backdrop-blur-[2px]" />
      </div>
      <main className="relative z-10 flex-1 flex flex-col w-full pb-safe bg-transparent">
        <div className="flex flex-col w-full pb-8 px-margin">
          <div className="relative flex flex-col items-center justify-end pb-4 pt-safe text-center select-none w-full">
            <div className="relative z-10 flex flex-col items-center px-4 pt-8">
              <div className="relative mb-3">
                <BrandMark className="w-10 h-10 text-canvas" />
              </div>
              <h1 className="font-headline-lg-mobile text-headline-lg-mobile tracking-tight drop-shadow-xs text-canvas">
                {t("brand.name")}
              </h1>
              <p className="font-body-md text-body-md mt-1 max-w-[260px] text-canvas/90">{t("brand.tagline")}</p>
            </div>
          </div>

          <div className="w-full bg-transparent rounded-lg p-6 flex flex-col gap-5 mt-2">
            <div className="flex items-center justify-between">
              <span className="font-title-md text-title-md text-on-surface">{t("login.title")}</span>
            </div>

            {oauthError && <ErrorBanner>{t(`login.oauthError.${oauthError}`)}</ErrorBanner>}
            {login.isError && <ErrorBanner>{authErrorText(login.error, t)}</ErrorBanner>}

            <form className="flex flex-col gap-4" onSubmit={submit}>
              <div className="flex flex-col gap-1.5">
                <Label className="font-label-md text-label-md text-on-surface-variant flex items-center justify-between pl-4" htmlFor="email">
                  {t("login.email")}
                </Label>
                <div className="relative flex items-center">
                  <Icon name="mail" className="absolute left-4 text-xl pointer-events-none text-on-surface-variant" />
                  <input
                    className={`${fieldClass} pr-4`}
                    id="email"
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    placeholder={t("login.emailPlaceholder")}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="font-label-md text-label-md text-on-surface-variant pl-4" htmlFor="password">
                  {t("login.password")}
                </Label>
                <div className="relative flex items-center">
                  <Icon name="lock" className="absolute left-4 text-xl pointer-events-none text-on-surface-variant" />
                  <input
                    className={`${fieldClass} pr-12`}
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder={t("login.passwordPlaceholder")}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    aria-label={t("password.toggleVisibility")}
                    aria-pressed={showPassword}
                    className="absolute right-3.5 w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:text-on-surface active:bg-surface-container transition-colors"
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-lg" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <Checkbox
                    checked={rememberMe}
                    onCheckedChange={(v) => setRememberMe(v === true)}
                    className="size-4 rounded-sm bg-surface-container-lowest data-[state=checked]:bg-primary"
                  />
                  <span className="font-label-sm text-label-sm text-canvas group-hover:text-on-surface transition-colors">
                    {t("login.rememberMe")}
                  </span>
                </label>
                <Link
                  to={paths.auth.forgotPassword()}
                  className="font-label-sm text-label-sm font-semibold text-canvas hover:underline underline-offset-4"
                >
                  {t("login.forgotPassword")}
                </Link>
              </div>

              <button
                className="w-full mt-2 h-12 bg-primary text-on-primary font-title-md text-title-md rounded-full flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all hover:bg-surface-container-highest hover:text-on-surface disabled:opacity-60"
                type="submit"
                disabled={login.isPending}
              >
                <span>{t("login.submit")}</span>
                <Icon name={login.isPending ? "progress_activity" : "arrow_forward"} className={login.isPending ? "text-lg animate-spin" : "text-lg"} />
              </button>
            </form>

            <div className="relative flex items-center justify-center my-1">
              <div className="w-full h-px bg-surface-container-high" />
              <span className="absolute bg-surface/60 backdrop-blur-md px-3 font-label-sm text-label-sm text-secondary rounded-full">
                {t("login.orContinueWith")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(["microsoft", "google"] as const).map((provider) => (
                <a
                  key={provider}
                  href={oauthStartUrl(provider, { next: next ?? undefined })}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-surface-container-low text-on-surface hover:bg-surface-container-high active:scale-95 transition-all shadow-xs"
                >
                  {provider === "microsoft" ? <MicrosoftLogo className="w-4 h-4" /> : <GoogleLogo className="w-4 h-4" />}
                  <span className="font-label-md text-label-md">{t(`providers.${provider}`)}</span>
                </a>
              ))}
            </div>

            <div className="text-center pt-2">
              <p className="font-body-md text-body-md text-secondary">
                {t("login.newHere")}{" "}
                <Link
                  to={paths.auth.signup()}
                  className="font-label-md text-label-md text-on-surface font-semibold underline underline-offset-4 hover:opacity-80"
                >
                  {t("login.createAccount")}
                </Link>
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center justify-center gap-2 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container/40 text-on-secondary-fixed">
              <Icon name="verified_user" filled className="text-sm" />
              <span className="font-micro-meta text-micro-meta tracking-wider uppercase">{t("login.secured")}</span>
            </div>
            <p className="font-label-sm text-label-sm text-secondary max-w-[280px]">{t("login.securedBody")}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
