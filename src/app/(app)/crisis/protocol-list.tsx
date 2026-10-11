"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface CrisisProtocolItem {
  id: string;
  title: string;
  description: string | null;
  whoToCall: string | null;
  whoMayCommunicate: string | null;
  steps: string | null;
}

const NOT_FILLED = "Nog niet ingevuld — vraag dit na bij een beheerder.";

/**
 * Compacte lijst met één tegel per incidenttype; klikken opent het
 * volledige protocol in een pop-up, zodat de pagina overzichtelijk blijft
 * ook als er veel protocollen zijn.
 */
export function CrisisProtocolList({ protocols }: { protocols: CrisisProtocolItem[] }) {
  const [selected, setSelected] = useState<CrisisProtocolItem | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {protocols.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p)}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:bg-surface-muted"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{p.title}</p>
              {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setSelected(null)}
        // Klik op de achtergrond (buiten het paneel) sluit de pop-up.
        onClick={(e) => e.target === dialogRef.current && setSelected(null)}
        aria-labelledby="crisis-dialog-title"
        className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-lg rounded-lg border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-black/50"
      >
        {selected && (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="crisis-dialog-title" className="text-lg font-bold leading-tight">
                  {selected.title}
                </h2>
                {selected.description && <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Sluiten"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <Badge variant={selected.whoToCall ? "primary" : "outline"} className="mb-1.5">
                  Wie bellen?
                </Badge>
                <p className="whitespace-pre-wrap text-sm">{selected.whoToCall || NOT_FILLED}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <Badge variant={selected.whoMayCommunicate ? "primary" : "outline"} className="mb-1.5">
                  Wie mag communiceren?
                </Badge>
                <p className="whitespace-pre-wrap text-sm">{selected.whoMayCommunicate || NOT_FILLED}</p>
              </div>
            </div>
            {selected.steps && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{selected.steps}</p>}
          </div>
        )}
      </dialog>
    </>
  );
}
