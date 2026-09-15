"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

/**
 * Verwijderknop voor een ontwerpkaart (dashboard "Recente ontwerpen" en
 * /designs). Staat als overlay bovenop de kaart, die zelf een <Link> is —
 * voorkomt daarom expliciet dat de klik ook de navigatie triggert.
 */
export function DesignDeleteButton({ designId }: { designId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Dit ontwerp verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/designs/${designId}`, { method: "DELETE" });
      if (res.ok) startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy || isPending}
      title="Ontwerp verwijderen"
      className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-destructive disabled:opacity-65"
    >
      {busy || isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
