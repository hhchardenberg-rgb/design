"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Share, X } from "lucide-react";
import type { PwaApp } from "@/lib/pwa-apps";

/**
 * Discrete melding "Zet dit onderdeel als app op je telefoon", alleen op een telefoon of tablet,
 * alleen in de browser (niet als de app al geopend is) en weg te klikken. In de geïnstalleerde
 * app registreert hij de service worker die bij geen verbinding een nette melding toont.
 *
 * Android (Chrome): de knop "Installeren" opent het installatievenster van de browser.
 * iPhone/iPad: dat venster bestaat niet; de melding legt "Zet op beginscherm" uit.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Chrome stuurt "beforeinstallprompt" soms al voordat dit onderdeel getoond wordt; daarom
// vangen we hem op zodra deze module laadt, samen met het manifest dat op dat moment gold.
let deferred: { event: InstallPromptEvent; manifest: string | null } | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const currentManifest = () => document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute("href") ?? null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = { event: e as InstallPromptEvent, manifest: currentManifest() };
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

type Platform = "ios" | "android" | "other";
function detect(): { platform: Platform; standalone: boolean; safari: boolean } {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { platform: ios ? "ios" : /Android/.test(ua) ? "android" : "other", standalone, safari: ios && !/CriOS|FxiOS|EdgiOS/.test(ua) };
}

const storageKey = (app: PwaApp) => `hhc_app_hint_${app.key}`;

export function InstallAppHint({ app }: { app: PwaApp }) {
  const [env, setEnv] = useState<ReturnType<typeof detect> | null>(null);
  const [hidden, setHidden] = useState(true);
  const [help, setHelp] = useState(false);
  const prompt = useSyncExternalStore(subscribe, () => deferred, () => null);

  useEffect(() => {
    const d = detect();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leest browsergegevens die server-side niet bestaan
    setEnv(d);
    if (d.standalone && "serviceWorker" in navigator) navigator.serviceWorker.register("/app-sw.js", { scope: "/" }).catch(() => {});
    try {
      setHidden(localStorage.getItem(storageKey(app)) === "1");
    } catch {
      setHidden(false);
    }
    setHelp(false);
  }, [app]);

  if (!env || env.standalone || env.platform === "other" || hidden) return null;

  // Alleen het installatievenster van dít onderdeel (het manifest kan bij het wisselen van onderdeel veranderen).
  const canPrompt = !!prompt && prompt.manifest === app.manifest;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(storageKey(app), "1");
    } catch {
      /* privévenster: dan alleen voor nu verbergen */
    }
  }

  async function install() {
    if (!prompt) return;
    await prompt.event.prompt();
    const choice = await prompt.event.userChoice.catch(() => null);
    deferred = null;
    notify();
    if (choice?.outcome === "accepted") dismiss();
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-3 sm:p-4" role="region" aria-label={`${app.shortName} als app`}>
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- klein vast icoon uit /public */}
        <img src={`/apps/${app.key}/icon-192.png`} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Zet {app.shortName} als app op je telefoon</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Eigen icoon op je beginscherm, opent direct hier en zonder adresbalk.</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {canPrompt ? (
              <button type="button" onClick={install} className="h-9 rounded-lg bg-foreground px-3.5 text-sm font-semibold text-background">
                Installeren
              </button>
            ) : (
              <button type="button" onClick={() => setHelp((v) => !v)} aria-expanded={help} className="h-9 rounded-lg border border-border bg-background px-3.5 text-sm font-semibold">
                Hoe werkt het?
              </button>
            )}
            <button type="button" onClick={dismiss} className="h-9 px-2 text-sm text-muted-foreground hover:text-foreground">
              Niet nu
            </button>
          </div>
          {help && !canPrompt && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {env.platform === "ios" ? (
                <>
                  <li>
                    Tik op <Share className="inline h-4 w-4 -translate-y-px text-foreground" aria-label="Deel" /> <span className="text-foreground">Deel</span>{" "}
                    {env.safari ? "onderaan (of bovenaan) in Safari." : "in de adresbalk."}
                  </li>
                  <li>
                    Scrol omlaag en kies <span className="text-foreground">Zet op beginscherm</span>.
                  </li>
                  <li>
                    Tik op <span className="text-foreground">Voeg toe</span>. De app heet &quot;{app.shortName}&quot;.
                  </li>
                </>
              ) : (
                <>
                  <li>
                    Open het menu <span className="text-foreground">⋮</span> rechtsboven in Chrome.
                  </li>
                  <li>
                    Kies <span className="text-foreground">App installeren</span> of <span className="text-foreground">Toevoegen aan startscherm</span>.
                  </li>
                </>
              )}
            </ol>
          )}
        </div>
        <button type="button" onClick={dismiss} className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted" aria-label="Melding sluiten">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
