"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const dismissKey = "titan_pwa_install_dismissed_v1";

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 860px)").matches || /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function syncAppChromeClasses() {
  if (typeof document === "undefined") return;

  document.documentElement.classList.toggle("titan-standalone", isStandaloneDisplay());
  document.documentElement.classList.toggle("titan-mobile", isMobileViewport());
}

export default function PwaRegistrar() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [standalone, setStandalone] = useState(true);

  const shouldShowInstallPrompt = useMemo(() => {
    return !standalone && !dismissed && isMobileViewport();
  }, [dismissed, standalone]);

  const appleInstructions = shouldShowInstallPrompt && isAppleMobile() && !installEvent;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTimer = window.setTimeout(() => {
      syncAppChromeClasses();
      setStandalone(isStandaloneDisplay());
      setDismissed(window.localStorage.getItem(dismissKey) === "true");
    }, 0);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      syncAppChromeClasses();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setStandalone(isStandaloneDisplay());
      setDismissed(window.localStorage.getItem(dismissKey) === "true");
    };

    const onAppInstalled = () => {
      syncAppChromeClasses();
      setStandalone(true);
      setInstallEvent(null);
      window.localStorage.setItem(dismissKey, "true");
      setDismissed(true);
    };

    const onViewportChange = () => syncAppChromeClasses();

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);

    return () => {
      window.clearTimeout(syncTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
    };
  }, []);

  async function installApp() {
    if (!installEvent) return;

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);

    if (choice.outcome === "accepted") {
      window.localStorage.setItem(dismissKey, "true");
      setDismissed(true);
      setStandalone(true);
    }
  }

  function dismissPrompt() {
    window.localStorage.setItem(dismissKey, "true");
    setDismissed(true);
  }

  if (!shouldShowInstallPrompt) return null;

  return (
    <aside className="pwa-install-card" aria-label="Install TITAN">
      <div>
        <strong>Install TITAN</strong>
        <span>
          {appleInstructions
            ? "Tap Share, then Add to Home Screen to open TITAN like an app."
            : "Add TITAN to this phone for a full-screen app experience."}
        </span>
      </div>
      <div className="pwa-install-actions">
        {installEvent && (
          <button type="button" onClick={installApp}>
            Install
          </button>
        )}
        <button type="button" className="ghost" onClick={dismissPrompt}>
          Later
        </button>
      </div>
    </aside>
  );
}
