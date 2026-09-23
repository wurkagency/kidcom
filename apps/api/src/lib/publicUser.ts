import type { PublicUser } from "@kidcom/shared";
import { isLocale, isThemeId } from "@kidcom/shared";

type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
  themeId: string | null;
  locale: string | null;
};

// The single User → PublicUser mapping for every endpoint that returns the
// signed-in account. A stored themeId/locale the catalogue no longer knows
// (a retired theme, say) degrades to null, i.e. the code-level default.
export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    themeId: isThemeId(user.themeId) ? user.themeId : null,
    locale: isLocale(user.locale) ? user.locale : null,
  };
}
