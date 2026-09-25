import { useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import type { OAuthProviderId } from "@kinnd/shared";
import { oauthStartUrl, useT } from "@kinnd/core";

import { BrandMark, GoogleLogo, MicrosoftLogo } from "../components/BrandMark";
import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

// Building blocks shared by the auth screens. Markup and classes follow the
// Stitch exports kinnd_sign_up / kinnd_forgot_password /
// kinnd_reset_password (the "sage" auth layout); the login screen has its
// own photographic layout (LoginScreen.tsx).
//
// Where an export wrote "rounded-DEFAULT" (not a real Tailwind class, so it
// rendered square), the square corner is kept: the screens are the truth.

/** Porcelain page with the soft mint glow and the empty frosted top bar. */
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen relative flex flex-col selection:bg-secondary-container selection:text-on-secondary-fixed">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[15%] left-1/2 -translate-x-1/2 w-[130vw] h-[55vh] bg-gradient-to-b from-secondary-container/25 via-surface-container-low/30 to-transparent blur-3xl opacity-75 rounded-full" />
      </div>
      <header className="fixed top-0 inset-x-0 z-50 bg-surface/85 backdrop-blur-xl pt-safe" />
      <main className="relative z-10 flex-1 flex flex-col w-full px-margin pt-16 pb-safe bg-surface">
        <div className="flex flex-col w-full pb-8">{children}</div>
      </main>
    </div>
  );
}

/** Sage emblem + "Kinnd" + tagline. */
export function AuthBrand() {
  const { t } = useT("auth");
  return (
    <div className="flex flex-col items-center justify-center text-center pt-2 pb-8">
      <div className="mb-3">
        <BrandMark className="w-12 h-11 text-sage" />
      </div>
      <h2 className="text-[32px] font-bold tracking-tight leading-none mb-2 font-headline-lg text-sage">{t("brand.name")}</h2>
      <p className="text-sm font-medium text-black/70 font-body-md">{t("brand.tagline")}</p>
    </div>
  );
}

/** Screen title + supporting line under the brand. */
export function AuthTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="text-center mb-6">
      <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight mb-2">{title}</h1>
      {subtitle && (
        <p className="font-body-md text-body-md text-on-surface-variant max-w-[320px] mx-auto leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}

/** White card holding a form. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("w-full bg-surface-container-lowest rounded-lg p-6 shadow-sm flex flex-col gap-5", className)}>{children}</div>
  );
}

type IconFieldProps = ComponentProps<typeof Input> & {
  id: string;
  label: string;
  icon?: string;
  trailing?: ReactNode;
  hint?: ReactNode;
};

/** Label + leading icon + Aura input (the sign-up / recovery field). */
export function IconField({ id, label, icon, trailing, hint, className, ...input }: IconFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="font-label-md text-label-md text-on-surface">
        {label}
      </Label>
      <div className="relative flex items-center">
        {icon && <Icon name={icon} className="absolute left-4 text-secondary text-[20px] pointer-events-none" />}
        <Input id={id} className={cn(icon && "pl-12", trailing && "pr-12", className)} {...input} />
        {trailing}
      </div>
      {hint}
    </div>
  );
}

/** The eye toggle inside a password input. */
export function VisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const { t } = useT("auth");
  return (
    <button
      type="button"
      aria-label={t("password.toggleVisibility")}
      aria-pressed={visible}
      onClick={onToggle}
      className="absolute right-2 w-9 h-9 rounded-full flex items-center justify-center text-secondary hover:bg-surface-container transition-colors"
    >
      <Icon name={visible ? "visibility" : "visibility_off"} className="text-[20px]" />
    </button>
  );
}

/** "or join with" divider + Microsoft / Google (sign-up styling). */
export function ProviderButtons({
  label,
  blocked,
  onBlocked,
  acceptedTerms,
  next,
}: {
  label: string;
  /** When true, a tap calls onBlocked instead of leaving for the provider. */
  blocked?: boolean;
  onBlocked?: () => void;
  acceptedTerms?: boolean;
  next?: string;
}) {
  const { t } = useT("auth");
  const href = (provider: OAuthProviderId) => oauthStartUrl(provider, { acceptedTerms, next });
  const guard = (e: MouseEvent) => {
    if (!blocked) return;
    e.preventDefault();
    onBlocked?.();
  };
  const button =
    "h-12 rounded-full bg-surface-container-lowest flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all text-on-surface";
  return (
    <div className="flex flex-col items-center gap-4 mb-6">
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-surface-container-high" />
        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">{label}</span>
        <div className="flex-1 h-px bg-surface-container-high" />
      </div>
      <div className="grid grid-cols-2 gap-3 w-full">
        <a href={href("microsoft")} onClick={guard} className={button}>
          <MicrosoftLogo className="w-5 h-5" />
          <span className="font-title-md text-title-md">{t("providers.microsoft")}</span>
        </a>
        <a href={href("google")} onClick={guard} className={button}>
          <GoogleLogo className="w-5 h-5" />
          <span className="font-title-md text-title-md">{t("providers.google")}</span>
        </a>
      </div>
    </div>
  );
}

/** Dismissible mint "Parent Security Shield" reassurance card. */
export function SecurityShield() {
  const { t } = useT("auth");
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="mt-6 bg-mint rounded-lg p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-surface-container-lowest flex items-center justify-center text-on-secondary-fixed shrink-0 shadow-sm">
          <Icon name="verified_user" className="text-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-title-md text-title-md text-on-surface leading-tight">{t("shield.title")}</h4>
          <p className="font-label-sm text-label-sm text-secondary leading-snug mt-0.5">{t("shield.body")}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={t("shield.dismiss")}
        className="text-secondary hover:text-on-surface p-1 shrink-0 rounded-full hover:bg-black/5 transition-colors flex items-center justify-center"
      >
        <Icon name="close" className="text-[18px]" />
      </button>
    </div>
  );
}

/** "Remembered your credentials? Sign in" footer link. */
export function BackToSignIn({ onClick }: { onClick: () => void }) {
  const { t } = useT("auth");
  return (
    <div className="mt-6 flex justify-center items-center">
      <button
        type="button"
        onClick={onClick}
        className="font-label-md text-label-md text-secondary hover:text-on-surface transition-colors py-2 px-4 rounded-full hover:bg-surface-container"
      >
        {t("recovery.remembered")}{" "}
        <span className="text-on-surface font-title-md underline decoration-secondary-container underline-offset-4">
          {t("recovery.signIn")}
        </span>
      </button>
    </div>
  );
}

/** Success banner (forgot password "Check your inbox" pattern). */
export function SuccessBanner({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="status" className="p-4 bg-secondary-container text-on-secondary-fixed flex items-start gap-3">
      <Icon name="check_circle" className="text-[20px] text-on-secondary-fixed shrink-0" />
      <div className="flex-1">
        <div className="font-title-md text-title-md">{title}</div>
        {children && <div className="font-body-md text-body-md text-on-secondary-fixed-variant mt-1">{children}</div>}
      </div>
    </div>
  );
}

/** Error banner — the success banner's shape in Aura's error roles. */
export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="p-4 bg-error-container text-on-error-container flex items-start gap-3">
      <Icon name="error" className="text-[20px] shrink-0" />
      <p className="flex-1 font-body-md text-body-md">{children}</p>
    </div>
  );
}

/** Primary submit button with trailing arrow, as on every auth screen. */
export function SubmitButton({ children, pending, className, ...props }: ComponentProps<"button"> & { pending?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      className={cn(
        "w-full h-12 rounded-full bg-primary text-on-primary font-title-md text-title-md flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-all select-none disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      <Icon name={pending ? "progress_activity" : "arrow_forward"} className={cn("text-[18px]", pending && "animate-spin")} />
    </button>
  );
}
