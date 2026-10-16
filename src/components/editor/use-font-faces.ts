"use client";

import { useEffect, useState } from "react";
import type { FontFaceInfo } from "@/lib/fonts/faces";

/**
 * Laadt fontbestanden onder hun unieke alias in de browser (zelfde bestand
 * en alias als de server-export). Pas als alle benodigde faces geladen zijn
 * wordt tekst gemeten; anders zou de layout met een systeemfont berekend
 * worden en na het laden verspringen.
 */
const loading = new Map<string, Promise<boolean>>();

function loadFace(face: FontFaceInfo): Promise<boolean> {
  let pending = loading.get(face.alias);
  if (!pending) {
    pending = new FontFace(face.alias, `url(${JSON.stringify(face.url)})`, {
      weight: String(face.weight),
      style: face.style,
    })
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        return true;
      })
      .catch(() => {
        loading.delete(face.alias);
        return false;
      });
    loading.set(face.alias, pending);
  }
  return pending;
}

export interface FontLoadState {
  ready: boolean;
  /** Faces die niet geladen konden worden (preview toont dan een systeemletter). */
  failed: string[];
}

export function useFontFaces(faces: FontFaceInfo[]): FontLoadState {
  const key = faces.map((f) => f.alias).sort().join("|");
  const [state, setState] = useState<{ key: string; failed: string[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unique = [...new Map(faces.map((f) => [f.alias, f])).values()];
    Promise.all(unique.map(async (f) => ((await loadFace(f)) ? null : `${f.family} ${f.subfamily}`))).then((results) => {
      if (!cancelled) setState({ key, failed: results.filter((r): r is string => r !== null) });
    });
    return () => {
      cancelled = true;
    };
    // faces is afgeleid van key; alleen opnieuw laden als de set verandert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!state || state.key !== key) return { ready: faces.length === 0, failed: [] };
  return { ready: true, failed: state.failed };
}
