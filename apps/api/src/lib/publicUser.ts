import type { OAuthProviderId, PublicUser } from "@kidcom/shared";
import { isLocale, isRegion, isThemeId } from "@kidcom/shared";

import { prisma } from "../db";

type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  passwordHash: string | null;
  themeId: string | null;
  locale: string | null;
  region: string | null;
  oauthAccounts: { provider: "GOOGLE" | "MICROSOFT" }[];
  phoneCodes: { phone: string }[];
};

// The single User → PublicUser mapping for every endpoint that returns the
// signed-in account. A stored themeId/locale the catalogue no longer knows
// (a retired theme, say) degrades to null, i.e. the code-level default.
// The password hash itself never leaves the server — only whether one is set.
export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    phone: user.phoneVerifiedAt ? user.phone : null,
    phoneVerifiedAt: user.phoneVerifiedAt ? user.phoneVerifiedAt.toISOString() : null,
    pendingPhone: user.phoneCodes[0]?.phone ?? null,
    hasPassword: user.passwordHash !== null,
    oauthProviders: user.oauthAccounts.map((a) => a.provider.toLowerCase() as OAuthProviderId),
    themeId: isThemeId(user.themeId) ? user.themeId : null,
    locale: isLocale(user.locale) ? user.locale : null,
    region: isRegion(user.region) ? user.region : null,
  };
}

export async function loadPublicUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      oauthAccounts: { select: { provider: true } },
      phoneCodes: {
        where: { purpose: "VERIFY_PHONE", expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { phone: true },
      },
    },
  });
  return toPublicUser(user);
}
