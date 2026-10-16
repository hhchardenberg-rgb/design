import { NextResponse } from "next/server";
import type { TemplateImportJob } from "@prisma/client";
import type { ImportJobResult } from "./import-job.server";

/**
 * Antwoord voor een importtaak. Klaar: 200 met template, versie en
 * waarschuwingen (zelfde vorm als voorheen). Mislukt: 422 met de melding.
 * Nog bezig of opnieuw in de wachtrij: 202, de client vraagt de status op.
 */
export function importJobResponse(job: TemplateImportJob) {
  const base = { jobId: job.id, status: job.status, attempts: job.attempts };
  if (job.status === "DONE") {
    const result = job.result as unknown as ImportJobResult;
    return NextResponse.json({
      ...base,
      template: { id: result.templateId },
      version: { id: result.versionId },
      warnings: result.warnings,
    });
  }
  if (job.status === "FAILED") return NextResponse.json({ ...base, error: job.error ?? "Importeren is mislukt." }, { status: 422 });
  return NextResponse.json({ ...base, error: job.error }, { status: 202 });
}
