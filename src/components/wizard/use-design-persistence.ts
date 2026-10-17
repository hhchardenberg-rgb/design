"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DesignSaver, type SaverOptions } from "@/lib/design/saver";

export type { SaveState } from "@/lib/design/saver";

/** React-koppeling van DesignSaver (zie src/lib/design/saver.ts). */
export function useDesignPersistence(options: SaverOptions) {
  const [saver] = useState(() => new DesignSaver(options));
  const snapshot = useSyncExternalStore(saver.subscribe, saver.getSnapshot, saver.getSnapshot);

  const hasUnsaved = ["pending", "saving", "error", "invalid", "conflict"].includes(snapshot.state);
  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  // Zodra het concept bestaat, staat het in de adresbalk: herladen of de
  // link delen opent dan dit ontwerp in plaats van een nieuw, leeg ontwerp.
  const { designId } = snapshot;
  useEffect(() => {
    if (!designId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("designId") === designId) return;
    url.searchParams.delete("matchId");
    url.searchParams.set("designId", designId);
    window.history.replaceState(window.history.state, "", url);
  }, [designId]);

  useEffect(() => () => saver.dispose(), [saver]);

  return { saver, ...snapshot };
}
