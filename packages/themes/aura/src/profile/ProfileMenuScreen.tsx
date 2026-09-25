import { LEGAL_URLS, paths, useBillingStatus, useCurrentUser, useLogout, useNavigate, useT, useUnreadThreadCount } from "@kinnd/core";

import { MenuButton, MenuGroup, MenuLink } from "../components/MenuList";
import { PersonAvatar } from "../components/PersonAvatar";
import { ScreenTitle } from "../components/ScreenTitle";

// The profile menu (avatar in the header; no Stitch export — DESIGN.md list
// cards): who you are, then Family, Children, Messages, Account & Billing,
// Preferences and Bookmarks, and signing out.

export function ProfileMenuScreen() {
  const { t } = useT("profile");
  const me = useCurrentUser();
  const navigate = useNavigate();
  const logout = useLogout();
  const unread = useUnreadThreadCount();
  const { data: billing } = useBillingStatus();
  const name = `${me.firstName} ${me.lastName}`.trim();

  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <ScreenTitle>{t("title")}</ScreenTitle>
      <MenuLinkCard to={paths.profile.account()} name={name} email={me.email} avatar={me.avatarUrl} initials={`${me.firstName.charAt(0)}${me.lastName.charAt(0)}`} />

      <MenuGroup title={t("sections.family")}>
        <MenuLink to={paths.family.overview()} icon="diversity_3" label={t("family")} hint={t("familyHint")} />
        <MenuLink to={paths.children.overview()} icon="child_care" label={t("children")} hint={t("childrenHint")} />
        <MenuLink to={paths.messages.inbox()} icon="forum" label={t("messages")} badge={unread} />
        <MenuLink to={paths.bookmarks()} icon="bookmark" label={t("bookmarks")} />
      </MenuGroup>

      <MenuGroup title={t("sections.account")}>
        <MenuLink to={paths.profile.account()} icon="person" label={t("account")} hint={t("accountHint")} />
        <MenuLink to={paths.billing.overview()} icon="workspace_premium" label={t("billing")} value={billing ? t(`plan.${billing.tier}`) : undefined} />
        <MenuLink to={paths.preferences.overview()} icon="tune" label={t("preferences")} hint={t("preferencesHint")} />
      </MenuGroup>

      <MenuGroup>
        <MenuButton
          icon="logout"
          label={t("signOut")}
          disabled={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate(paths.auth.login(), { replace: true }) })}
        />
      </MenuGroup>

      <p className="flex justify-center gap-4 font-label-sm text-label-sm text-secondary">
        <a href={LEGAL_URLS.terms} target="_blank" rel="noreferrer" className="underline underline-offset-4">
          {t("terms")}
        </a>
        <a href={LEGAL_URLS.privacy} target="_blank" rel="noreferrer" className="underline underline-offset-4">
          {t("privacy")}
        </a>
      </p>
    </div>
  );
}

function MenuLinkCard({ to, name, email, avatar, initials }: { to: string; name: string; email: string; avatar: string | null; initials: string }) {
  return (
    <MenuGroup className="-mt-4">
      <MenuLink to={to} label={name} hint={email} trailing={<PersonAvatar mediaId={avatar} initials={initials} className="w-11 h-11" />} />
    </MenuGroup>
  );
}
