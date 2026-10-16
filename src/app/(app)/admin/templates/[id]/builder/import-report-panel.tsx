"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ImportReport } from "@/lib/psd/parse";
import type { TemplateSchemaJson } from "@/lib/validations/template";

const KIND_LABELS: Record<string, string> = {
  static: "Vast",
  text: "Tekstveld",
  image: "Fotoveld",
  color: "Kleurveld",
  visibility: "Aan/uit-groep",
  hidden: "Verborgen",
  empty: "Leeg",
};

const pct = (r: number) => `${(r * 100).toFixed(r < 0.01 ? 2 : 1)}%`;

type View = "reference" | "render" | "diff";

/**
 * Importcontrole in de builder: hoe het PSD is ingedeeld, wat niet
 * nagebootst wordt, en een visuele vergelijking tussen het ontwerp uit
 * Photoshop en de template zoals hij nu getekend wordt.
 */
export function ImportReportPanel({
  report,
  templateId,
  versionId,
  schema,
}: {
  report: ImportReport;
  templateId: string;
  versionId: string;
  schema: TemplateSchemaJson;
}) {
  const [view, setView] = useState<View>("reference");
  const [comparing, setComparing] = useState(false);
  const [compare, setCompare] = useState<{ changedRatio: number; render: string; diff: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const errors = report.issues.filter((i) => i.severity === "error");
  const warnings = report.issues.filter((i) => i.severity === "warning");
  const infos = report.issues.filter((i) => i.severity === "info");

  async function runCompare() {
    setComparing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/templates/${templateId}/versions/${versionId}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaJson: schema }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Vergelijken is niet gelukt.");
      setCompare(data);
      setView("diff");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vergelijken is niet gelukt.");
    } finally {
      setComparing(false);
    }
  }

  const image =
    view === "reference" ? report.referenceUrl : view === "render" ? compare?.render : compare?.diff ?? report.diffUrl;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Importcontrole</span>
        <Badge variant={errors.length ? "primary" : "success"}>
          {errors.length ? `${errors.length} blokkerend` : warnings.length ? `${warnings.length} let op` : "In orde"}
        </Badge>
      </div>
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        <li>
          Vergelijking met Photoshop:{" "}
          {report.match ? `${pct(report.match.changedRatio)} van de pixels wijkt af` : "niet mogelijk (geen samengestelde afbeelding in het bestand)"}
        </li>
        <li>Achtergrond: {report.backgroundSource === "photoshop" ? "samenstelling uit Photoshop" : "eigen samenstelling van de vaste lagen"}</li>
        <li>Losse lagen tegenover één samenstelling: {pct(report.stackMatch.changedRatio)} afwijkend</li>
      </ul>
      {[...errors, ...warnings].length > 0 && (
        <ul className="flex flex-col gap-1">
          {[...errors, ...warnings].map((issue, i) => (
            <li key={i} className={issue.severity === "error" ? "text-destructive" : "text-hhc-orange-dark"}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {infos.map((issue, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          {issue.message}
        </p>
      ))}

      {report.referenceUrl && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Vergelijking">
            {(
              [
                ["reference", "Photoshop"],
                ["render", "Template"],
                ["diff", "Verschillen"],
              ] as [View, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                disabled={v === "render" && !compare}
                onClick={() => setView(v)}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${view === v ? "border-primary bg-primary/10 text-hhc-orange-dark" : "border-border text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
            <Button size="sm" variant="outline" onClick={runCompare} disabled={comparing} className="ml-auto">
              {comparing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Template vergelijken
            </Button>
          </div>
          {compare && (
            <p className="text-xs text-muted-foreground">
              De template wijkt op {pct(compare.changedRatio)} van de pixels af van het ontwerp in Photoshop (rood in
              &ldquo;Verschillen&rdquo;).
            </p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={view === "reference" ? "Ontwerp uit Photoshop" : view === "render" ? "Template" : "Verschillen"} className="w-full rounded border border-border bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px]" />
          )}
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-xs font-medium">Lagen uit het PSD ({report.layers.length})</summary>
        <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-auto text-xs">
          {report.layers.map((l, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{l.name}</span>
              <span className="text-muted-foreground">
                {KIND_LABELS[l.kind] ?? l.kind}
                {l.field ? ` → ${l.field}` : ""}
                {l.segment !== undefined && l.kind === "static" ? ` (laag ${l.segment})` : ""}
              </span>
              {l.notes.length > 0 && <span className="text-hhc-orange-dark">{l.notes.join(", ")}</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
