import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Link, paths, useDesktopGateState, useT } from "@kidcom/core";

import { Icon } from "../components/Icon";
import { Button } from "../ui/button";

/** Neutral loading state: a quiet sage pulse, no spinner churn. */
export function Loading() {
  const { t } = useT("common");
  return (
    <div role="status" aria-live="polite" className="flex min-h-[40vh] w-full items-center justify-center">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sage" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}

export function ErrorFallback({ reset }: { error: unknown; reset: () => void }) {
  const { t } = useT("system");
  return (
    <div className="flex flex-col items-start gap-space-md rounded-[28px] border border-hairline bg-surface-container-lowest p-space-lg">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-error-container text-on-error-container">
        <Icon name="error" className="text-[20px]" />
      </span>
      <div>
        <h2 className="font-title-md text-title-md text-on-surface">{t("error.title")}</h2>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">{t("error.body")}</p>
      </div>
      <Button variant="default" onClick={reset}>
        {t("error.retry")}
      </Button>
    </div>
  );
}

/**
 * Temporary stand-in for a screen whose v3.0 build phase hasn't landed yet
 * (see tasks/todo.md). Every use is listed in src/screens/index.ts and all
 * are gone by the end of Phase 7.
 */
export function NotFoundScreen() {
  const { t } = useT("system");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-space-md px-margin text-center">
      <h1 className="font-headline-md text-headline-md text-on-surface">{t("notFound.title")}</h1>
      <p className="font-body-md text-body-md text-on-surface-variant">{t("notFound.body")}</p>
      <Button asChild>
        <Link to={paths.today()}>{t("notFound.home")}</Link>
      </Button>
    </div>
  );
}

/**
 * Desktop soft gate (SoW: the app is for phones). Built from DESIGN.md:
 * porcelain canvas, a white floating card, obsidian primary pill.
 */
export function DesktopGateScreen() {
  const { t } = useT("system");
  const { handoffUrl, dismiss } = useDesktopGateState();
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toString(handoffUrl, {
      type: "svg",
      margin: 0,
      color: { dark: "#161a18", light: "#00000000" }, // obsidian on transparent
    }).then(setQr, () => setQr(null));
  }, [handoffUrl]);

  return (
    <div className="flex min-h-screen items-center justify-center px-margin py-space-xl">
      <div className="flex w-full max-w-md flex-col items-center gap-space-lg rounded-[32px] border border-hairline bg-surface-container-lowest p-space-xl text-center shadow-float">
        <img src="/logo.svg" alt="KidCom" className="h-12 w-12" />
        <div className="flex flex-col gap-space-xs">
          <h1 className="font-headline-md text-headline-md text-on-surface">{t("desktopGate.title")}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">{t("desktopGate.body")}</p>
        </div>
        <div className="rounded-[28px] bg-mint p-space-lg">
          {qr ? (
            <div
              role="img"
              aria-label={t("desktopGate.qrLabel")}
              className="h-44 w-44 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          ) : (
            <div className="h-44 w-44" />
          )}
        </div>
        <p className="font-label-md text-label-md text-on-surface-variant">{t("desktopGate.scan")}</p>
        <Button variant="ghost" onClick={dismiss}>
          {t("desktopGate.continue")}
        </Button>
      </div>
    </div>
  );
}
