import { useEffect, useState } from "react";

import { Icon } from "./Icon";

// Shown once, the first time a browser has an authenticated session (not
// literally "first ever login" server-side — that's indistinguishable from
// this for what the feature needs, and keeping the gate purely client-side
// means no backend field to add). Gated by localStorage since
// beforeinstallprompt itself is scoped per-browser/per-device, not
// per-account, so a localStorage flag is the *correct* scope here, not a
// workaround.
const SHOWN_KEY = "kidcom-install-prompt-shown";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own (non-standard) flag for "launched from home screen".
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      return;
    }
    let alreadyShown = false;
    try {
      alreadyShown = localStorage.getItem(SHOWN_KEY) === "1";
    } catch {
      // Private browsing / storage blocked — treat as "not shown yet" rather
      // than crash; worst case the prompt reappears next session.
    }
    if (alreadyShown) {
      return;
    }

    if (isIos()) {
      // No beforeinstallprompt on iOS Safari — show the manual-instructions
      // variant immediately rather than waiting for an event that never fires.
      setVisible(true);
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    function onAppInstalled() {
      dismiss();
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  function markShown() {
    try {
      localStorage.setItem(SHOWN_KEY, "1");
    } catch {
      // Ignore — worst case this shows again next session.
    }
  }

  function dismiss() {
    markShown();
    setVisible(false);
  }

  async function handleAdd() {
    markShown();
    if (deferredEvent) {
      await deferredEvent.prompt();
      await deferredEvent.userChoice;
    }
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-24">
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-lg border border-outline-variant p-5 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <img src="/logo.svg" alt="" className="h-10 w-10 rounded-lg flex-shrink-0" />
          <div>
            <h2 className="font-headline-md text-body-lg text-text-main font-semibold">
              Add KidCom to your device
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              {isIos()
                ? "Tap the Share icon, then \"Add to Home Screen\" for one-tap access, just like an app."
                : "Get one-tap access from your home screen, just like an app."}
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="font-label-md text-label-md text-on-surface-variant px-4 py-2 rounded-full"
          >
            Not now
          </button>
          {!isIos() && (
            <button
              type="button"
              onClick={handleAdd}
              className="bg-primary text-on-primary font-label-md text-label-md px-5 py-2 rounded-full shadow-md active:scale-[0.98] transition-all flex items-center gap-1"
            >
              <Icon name="add_to_home_screen" className="text-lg" />
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
