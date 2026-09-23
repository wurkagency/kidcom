import { useState } from "react";
import {
  paths,
  safeNextPath,
  useCancelTwoFactor,
  useNavigate,
  useResendTwoFactor,
  useSearchParams,
  useT,
  useVerifyTwoFactor,
} from "@kidcom/core";

import { AuthBrand, AuthCard, AuthPage, AuthTitle, ErrorBanner, SecurityShield, SubmitButton } from "./AuthParts";
import { CodeInput, ResendCode } from "./CodeEntry";
import { authErrorText } from "./errors";

// Sign-in step 2: the 6-digit code emailed after the password check.
// No Stitch export exists for it; composed from the sage auth layout.
export function TwoFactorScreen() {
  const { t } = useT("auth");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const next = safeNextPath(params.get("next"));
  const [code, setCode] = useState("");
  const verify = useVerifyTwoFactor();
  const resend = useResendTwoFactor();
  const cancel = useCancelTwoFactor();

  const submit = (value = code) => {
    if (value.length !== 6) return;
    verify.mutate(value, {
      onSuccess: () => navigate(next ?? paths.today(), { replace: true }),
      onError: () => setCode(""), // a rejected code clears the boxes for the next attempt
    });
  };

  return (
    <AuthPage>
      <AuthBrand />
      <AuthTitle title={t("twoFactor.title")} subtitle={email ? t("twoFactor.subtitleEmail", { email }) : t("twoFactor.subtitle")} />
      <AuthCard>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <CodeInput value={code} onChange={setCode} onComplete={submit} disabled={verify.isPending} invalid={verify.isError} />
          {verify.isError && <ErrorBanner>{authErrorText(verify.error, t)}</ErrorBanner>}
          <SubmitButton pending={verify.isPending} disabled={code.length !== 6}>
            {t("twoFactor.submit")}
          </SubmitButton>
        </form>
        <ResendCode onResend={() => resend.mutate()} pending={resend.isPending} />
      </AuthCard>
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => cancel.mutate(undefined, { onSettled: () => navigate(paths.auth.login(), { replace: true }) })}
          className="font-label-md text-label-md text-secondary hover:text-on-surface transition-colors py-2 px-4 rounded-full hover:bg-surface-container"
        >
          {t("twoFactor.differentAccount")}
        </button>
      </div>
      <SecurityShield />
    </AuthPage>
  );
}
