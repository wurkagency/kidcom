import { useCallback, useState } from "react";

// Kinnd is a phone app. On a desktop browser we show a "continue on your
// phone" screen (QR code of the current URL) with a "continue anyway" way
// through. This is a UX nudge, not a security control: anything enforced
// client-side can be bypassed, and nothing here gates data.

const DISMISS_KEY = "kinnd.desktopGateDismissed";

type NavigatorWithUAData = Navigator & { userAgentData?: { mobile?: boolean } };

export function isMobileDevice(nav: Navigator = navigator): boolean {
  const uaData = (nav as NavigatorWithUAData).userAgentData;
  if (uaData && typeof uaData.mobile === "boolean" && uaData.mobile) return true;
  const ua = nav.userAgent;
  if (/Android|iPhone|iPod|iPad|Mobile|Windows Phone/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /Macintosh/.test(ua) && nav.maxTouchPoints > 1;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export type DesktopGate = {
  /** True when the gate should be shown instead of the app. */
  active: boolean;
  /** The URL to hand over to the phone (encoded in the QR code). */
  handoffUrl: string;
  /** "Continue anyway" — remembered on this browser. */
  dismiss: () => void;
};

export function useDesktopGate(): DesktopGate {
  const [dismissed, setDismissed] = useState(readDismissed);
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Not remembered; still dismissed for this session.
    }
    setDismissed(true);
  }, []);
  return {
    active: !dismissed && !isMobileDevice(),
    handoffUrl: typeof window === "undefined" ? "" : window.location.href,
    dismiss,
  };
}
