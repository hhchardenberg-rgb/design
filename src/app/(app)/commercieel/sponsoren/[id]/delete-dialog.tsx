"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { api } from "@/lib/commercial/client";
import { useStableToast as useToast } from "@/lib/commercial/use-stable-toast";

interface Preview {
  id: string;
  name: string;
  activeContracts: number;
  counts: { contacts: number; activities: number; tasks: number; files: number; contracts: number; opportunities: number; invoices: number };
}

const COUNT_LABELS: [keyof Preview["counts"], string, string][] = [
  ["contacts", "contactpersoon", "contactpersonen"],
  ["activities", "contactmoment", "contactmomenten"],
  ["tasks", "taak", "taken"],
  ["files", "bestand", "bestanden"],
  ["contracts", "contract", "contracten"],
  ["opportunities", "kans", "kansen"],
  ["invoices", "factuur of creditnota", "facturen en creditnota's"],
];

/** Knop + bevestigingsvenster: een dossier verwijderen naar het gesloten archief. */
export function DeleteCompanyButton({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" /> Dossier verwijderen
      </Button>
      {open && <DeleteDialog companyId={companyId} onClose={() => setOpen(false)} />}
    </>
  );
}

function DeleteDialog({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Preview>(`/api/commercial/companies/${companyId}/delete`).then((r) => (r.ok ? setPreview(r.data) : setError(r.error)));
  }, [companyId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function confirm() {
    setBusy(true);
    const r = await api(`/api/commercial/companies/${companyId}/delete`, "POST", { confirm: true, reason: reason.trim() || null });
    if (r.ok) {
      toast.success("Dossier verwijderd en bewaard in het gesloten archief.");
      router.push("/commercieel/sponsoren");
    } else {
      setBusy(false);
      toast.error(r.error);
    }
  }

  const linked = preview ? COUNT_LABELS.filter(([k]) => preview.counts[k] > 0).map(([k, one, many]) => `${preview.counts[k]} ${preview.counts[k] === 1 ? one : many}`) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-desc" className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl">
        <h2 id="delete-title" className="text-lg font-semibold">Weet je zeker dat je dit dossier wilt verwijderen?</h2>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!preview && !error && <p className="text-sm text-muted-foreground">Even kijken wat er aan dit dossier vastzit…</p>}
        {preview && (
          <div id="delete-desc" className="space-y-3 text-sm">
            <p>
              <strong>{preview.name}</strong> verdwijnt uit alle lijsten, overzichten, rapportages, herinneringen en mailings.
              {linked.length > 0 ? ` Ook ${linked.join(", ")} gaan mee.` : ""}
            </p>
            {preview.activeContracts > 0 && (
              <p className="font-medium text-destructive">
                Let op: dit dossier heeft {preview.activeContracts === 1 ? "een lopend contract" : `${preview.activeContracts} lopende contracten`}.
              </p>
            )}
            <p className="text-muted-foreground">
              Er wordt niets gewist. Alles wordt bewaard in het gesloten archief, dat alleen beheerders kunnen zien. Een beheerder kan het dossier daar terugzetten.
            </p>
            <div>
              <Label htmlFor="delete-reason">Reden (optioneel, zichtbaar in het archief)</Label>
              <Textarea id="delete-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Bijvoorbeeld: dubbel aangemaakt, of bedrijf bestaat niet meer." />
            </div>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-hhc-orange" checked={sure} onChange={(e) => setSure(e.target.checked)} />
              <span>Ja, ik weet het zeker: verwijder dit dossier.</span>
            </label>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy} autoFocus>Annuleren</Button>
          <Button variant="destructive" disabled={!preview || !sure || busy} onClick={confirm}>{busy ? "Verwijderen…" : "Verwijderen"}</Button>
        </div>
      </div>
    </div>
  );
}
