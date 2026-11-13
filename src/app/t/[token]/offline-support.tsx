"use client";

import { useEffect, useState } from "react";

/** Zorgt dat deze ticketpagina ook zonder verbinding opent, en meldt het als je de opgeslagen versie ziet. */
export function OfflineSupport({ message }: { message: string }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/t-sw.js", { scope: "/t/" }).catch(() => {});
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return offline ? <p role="status" className="mt-3 rounded-md bg-amber-50 p-2 text-center text-xs text-amber-900">{message}</p> : null;
}
