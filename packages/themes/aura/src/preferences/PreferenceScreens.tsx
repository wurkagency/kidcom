import { useMemo, useState, type FormEvent } from "react";
import { ENABLED_LOCALES, THEME_IDS, type Locale, type NotificationPreferencesDto, type ThemeId } from "@kidcom/shared";
import {
  createFormatters,
  detectRegion,
  paths,
  useChangePassword,
  useCurrentUser,
  useFormat,
  useNotificationPreferences,
  useOtherSessions,
  usePush,
  useSignOutOtherDevices,
  useT,
  useUpdateNotificationPreferences,
  useUpdateProfile,
} from "@kidcom/core";

import { authErrorText } from "../auth/errors";
import { PasswordFields, passwordFormReady } from "../auth/PasswordFields";
import { EditorTitle, Field, FormCard, FormError, PrimaryButton } from "../components/Form";
import { Icon } from "../components/Icon";
import { MenuButton, MenuGroup, MenuItem, MenuLink } from "../components/MenuList";
import { ScreenTitle } from "../components/ScreenTitle";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";

// Preferences (Profile menu; no Stitch export — DESIGN.md list cards):
// language and country formats, theme, notifications, categories, security.

export function PreferencesScreen() {
  const { t } = useT("preferences");
  const me = useCurrentUser();
  const fmt = useFormat();
  const regionName = useRegionName();
  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <ScreenTitle>{t("title")}</ScreenTitle>
      <MenuGroup className="-mt-4">
        <MenuLink to={paths.preferences.language()} icon="translate" label={t("language.title")} value={t(`language.names.${me.locale ?? "en-US"}`)} />
        <MenuLink to={paths.preferences.language()} icon="public" label={t("region.title")} value={regionName(fmt.region)} />
        <MenuLink to={paths.preferences.theme()} icon="palette" label={t("theme.title")} value={t(`theme.names.${me.themeId ?? "aura"}`)} />
      </MenuGroup>
      <MenuGroup>
        <MenuLink to={paths.preferences.notifications()} icon="notifications" label={t("notifications.title")} />
        <MenuLink to={paths.preferences.categories()} icon="sell" label={t("categories")} />
        <MenuLink to={paths.preferences.security()} icon="lock" label={t("security.title")} />
      </MenuGroup>
    </div>
  );
}

// Countries offered for formats: the Nordics first, then Europe and beyond.
const REGIONS = ["DK", "NO", "SE", "FI", "IS", "DE", "NL", "BE", "FR", "GB", "IE", "ES", "IT", "PL", "AT", "CH", "US", "CA", "AU"];

function useRegionName() {
  const { i18n } = useT("preferences");
  return useMemo(() => {
    const names = new Intl.DisplayNames([i18n.language], { type: "region" });
    return (code: string) => names.of(code) ?? code;
  }, [i18n.language]);
}

function Radio({ on }: { on: boolean }) {
  return (
    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? "border-primary" : "border-outline-variant"}`}>
      {on && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
    </span>
  );
}

export function LanguageScreen() {
  const { t, i18n } = useT("preferences");
  const me = useCurrentUser();
  const update = useUpdateProfile();
  const regionName = useRegionName();
  const device = detectRegion();
  const current = me.region;

  // A sample of how dates and numbers will look.
  const sample = (region: string) => {
    const f = createFormatters(i18n.language, region);
    return `${f.date(new Date(), { day: "2-digit", month: "2-digit", year: "numeric" })} · ${f.time(new Date())} · ${f.number(1234.5)}`;
  };

  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <EditorTitle>{t("language.title")}</EditorTitle>
      <MenuGroup>
        {ENABLED_LOCALES.map((l: Locale) => (
          <MenuButton key={l} label={t(`language.names.${l}`)} trailing={<Radio on={(me.locale ?? "en-US") === l} />} onClick={() => update.mutate({ locale: l })} />
        ))}
      </MenuGroup>
      <p className="-mt-4 px-1 font-label-sm text-label-sm text-secondary">{t("language.more")}</p>

      <MenuGroup title={t("region.title")}>
        <MenuButton
          icon="smartphone"
          label={t("region.device")}
          hint={device ? `${regionName(device)} — ${sample(device)}` : t("region.deviceUnknown")}
          trailing={<Radio on={current === null} />}
          onClick={() => update.mutate({ region: null })}
        />
        {REGIONS.map((r) => (
          <MenuButton key={r} label={regionName(r)} hint={sample(r)} trailing={<Radio on={current === r} />} onClick={() => update.mutate({ region: r })} />
        ))}
      </MenuGroup>
      <p className="-mt-4 px-1 font-label-sm text-label-sm text-secondary">{t("region.hint")}</p>
    </div>
  );
}

export function ThemeScreen() {
  const { t } = useT("preferences");
  const me = useCurrentUser();
  const update = useUpdateProfile();
  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <EditorTitle>{t("theme.title")}</EditorTitle>
      <MenuGroup>
        {THEME_IDS.map((id: ThemeId) => (
          <MenuButton key={id} icon="palette" label={t(`theme.names.${id}`)} hint={t(`theme.hints.${id}`)} trailing={<Radio on={(me.themeId ?? "aura") === id} />} onClick={() => update.mutate({ themeId: id })} />
        ))}
      </MenuGroup>
      <p className="-mt-4 px-1 font-label-sm text-label-sm text-secondary">{t("theme.more")}</p>
    </div>
  );
}

export function NotificationSettingsScreen() {
  const { t } = useT("preferences");
  const push = usePush();
  const { data: prefs } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const set = (patch: Partial<NotificationPreferencesDto>) => update.mutate(patch);

  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <EditorTitle>{t("notifications.title")}</EditorTitle>
      <MenuGroup title={t("notifications.thisPhone")}>
        <MenuItem
          icon="notifications_active"
          label={t("notifications.push")}
          hint={t(`notifications.pushState.${push.state}`)}
          trailing={
            <Switch
              aria-label={t("notifications.push")}
              checked={push.state === "on"}
              disabled={push.busy || push.state === "unsupported" || push.state === "denied"}
              onCheckedChange={(on) => void (on ? push.enable() : push.disable())}
            />
          }
        />
      </MenuGroup>
      {!prefs ? (
        <Skeleton className="h-64 rounded-2xl bg-surface-container-lowest" />
      ) : (
        <>
          <MenuGroup title={t("notifications.about")}>
            {(
              [
                ["categoryCalendar", "calendar_today"],
                ["categoryMoments", "photo_library"],
                ["categoryLists", "checklist"],
                ["categoryMessages", "forum"],
              ] as const
            ).map(([key, icon]) => (
              <MenuItem
                key={key}
                icon={icon}
                label={t(`notifications.${key}`)}
                trailing={<Switch aria-label={t(`notifications.${key}`)} checked={prefs[key]} onCheckedChange={(on) => set({ [key]: on })} />}
              />
            ))}
            <MenuItem
              icon="mail"
              label={t("notifications.email")}
              hint={t("notifications.emailHint")}
              trailing={<Switch aria-label={t("notifications.email")} checked={prefs.emailEnabled} onCheckedChange={(on) => set({ emailEnabled: on })} />}
            />
          </MenuGroup>
          <MenuGroup title={t("notifications.quiet")}>
            <MenuItem
              icon="bedtime"
              label={t("notifications.quietOn")}
              hint={t("notifications.quietHint")}
              trailing={<Switch aria-label={t("notifications.quietOn")} checked={prefs.doNotDisturb} onCheckedChange={(on) => set({ doNotDisturb: on })} />}
            />
            {prefs.doNotDisturb && (
              <div className="grid grid-cols-2 gap-3 p-3.5">
                <Field id="quiet-from" label={t("notifications.from")}>
                  <Input id="quiet-from" type="time" value={prefs.quietHoursFrom} onChange={(e) => e.target.value && set({ quietHoursFrom: e.target.value })} />
                </Field>
                <Field id="quiet-to" label={t("notifications.to")}>
                  <Input id="quiet-to" type="time" value={prefs.quietHoursTo} onChange={(e) => e.target.value && set({ quietHoursTo: e.target.value })} />
                </Field>
              </div>
            )}
          </MenuGroup>
          <p className="-mt-4 px-1 font-label-sm text-label-sm text-secondary">{t("notifications.billingNote")}</p>
        </>
      )}
    </div>
  );
}

export function SecurityScreen() {
  const { t } = useT("preferences");
  const me = useCurrentUser();
  const { data: others = 0 } = useOtherSessions();
  const signOut = useSignOutOtherDevices();

  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <EditorTitle>{t("security.title")}</EditorTitle>
      {me.hasPassword ? <ChangePasswordCard /> : <p className="font-body-md text-body-md text-secondary">{t("security.noPassword")}</p>}
      <MenuGroup title={t("security.devices")}>
        <MenuItem icon="devices" label={t("security.otherDevices", { count: others })} hint={t("security.devicesHint")} />
        {others > 0 && <MenuButton icon="logout" label={t("security.signOutOthers")} disabled={signOut.isPending} onClick={() => signOut.mutate()} />}
      </MenuGroup>
      <MenuGroup title={t("security.signIn")}>
        <MenuItem icon="verified_user" label={t("security.codes")} hint={t("security.codesHint")} />
      </MenuGroup>
    </div>
  );
}

function ChangePasswordCard() {
  const { t } = useT("preferences");
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!current || !passwordFormReady(password, confirm)) return setError(t("security.incomplete"));
    change.mutate(
      { currentPassword: current, newPassword: password },
      {
        onSuccess: () => (setDone(true), setCurrent(""), setPassword(""), setConfirm("")),
        onError: (err) => setError(authErrorText(err, (k) => t(`auth:${k}`))),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <FormCard>
        <h2 className="font-title-md text-title-md text-on-surface">{t("security.changePassword")}</h2>
        <Field id="current-password" label={t("security.current")}>
          <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <PasswordFields password={password} confirm={confirm} onPasswordChange={setPassword} onConfirmChange={setConfirm} />
        <FormError message={error} />
        {done && (
          <p className="flex items-center gap-2 font-label-md text-label-md text-on-surface">
            <Icon name="check_circle" className="text-[18px]" />
            {t("security.changed")}
          </p>
        )}
        <PrimaryButton icon="lock_reset" disabled={change.isPending}>
          {t("security.save")}
        </PrimaryButton>
      </FormCard>
    </form>
  );
}

