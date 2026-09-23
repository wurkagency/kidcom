import type { PublicUser } from "@kidcom/shared";

import { paths } from "../routing/paths";

// Account setup after signup, in this order:
//   1. phone    — verify the mobile number by SMS (mandatory; the API refuses
//                 everything else until it's done)
//   2. password — create one (email signups only; Google/Microsoft accounts
//                 can add one later in settings)
//   3. email    — confirm the address from the link we emailed
export type SetupStep = "phone" | "password" | "email";

export function pendingSetupStep(user: PublicUser): SetupStep | null {
  if (!user.phoneVerifiedAt) return "phone";
  if (!user.hasPassword && user.oauthProviders.length === 0) return "password";
  if (!user.emailVerifiedAt) return "email";
  return null;
}

export const SETUP_STEP_PATH: Record<SetupStep, string> = {
  phone: paths.auth.verifyPhone(),
  password: paths.auth.createPassword(),
  email: paths.auth.verifyEmail(),
};
