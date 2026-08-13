import { useCallback, useEffect, useState } from "react";
import { INSTALL_HINT_KEY } from "../lib/constants";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isStandalone = (): boolean =>
  (typeof matchMedia !== "undefined" && matchMedia("(display-mode: standalone)").matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIOS = (): boolean => {
  const ua = navigator.userAgent || "";
  const iPadOS13 = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS13;
};

export interface UseInstall {
  /** Android/desktop Chrome gave us a prompt we can fire */
  canPrompt: boolean;
  install: () => void;
  /** iOS Safari has no prompt — it only offers Add to Home Screen in the share sheet */
  showIosHint: boolean;
  dismissIosHint: () => void;
}

export function useInstall(): UseInstall {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    let seen = false;
    try {
      seen = localStorage.getItem(INSTALL_HINT_KEY) === "1";
    } catch {
      seen = false;
    }
    if (isIOS() && !isStandalone() && !seen) setShowIosHint(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(() => {
    if (!deferred) return;
    void deferred.prompt().then(() => setDeferred(null));
  }, [deferred]);

  const dismissIosHint = useCallback(() => {
    setShowIosHint(false);
    try {
      localStorage.setItem(INSTALL_HINT_KEY, "1");
    } catch {
      /* it'll ask once more next time, no harm */
    }
  }, []);

  return { canPrompt: !!deferred, install, showIosHint, dismissIosHint };
}
