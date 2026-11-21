"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Laadt de (server)pagina één keer opnieuw zodra de achtergrondronde met Fullhouse klaar zou moeten zijn. */
export function RefreshAfterSync({ afterMs = 30_000 }: { afterMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.refresh(), afterMs);
    return () => clearTimeout(t);
  }, [router, afterMs]);
  return null;
}
