import { prisma } from "@/lib/prisma";
import { requireHubAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { isClaimable, runImportJob } from "@/lib/psd/import-job.server";
import { importJobResponse } from "@/lib/psd/import-job-response";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Status van een PSD-import. Staat de taak nog in de wachtrij of is de
 * vorige poging afgebroken (verlopen lease), dan wordt hij hier opnieuw
 * uitgevoerd.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireHubAdmin();
    const { id } = await params;
    const job = await prisma.templateImportJob.findUnique({ where: { id } });
    if (!job) throw new ApiError(404, "Importtaak niet gevonden.");
    if (job.status === "DONE" || job.status === "FAILED") return importJobResponse(job);
    if (isClaimable(job) || (job.status === "RUNNING" && job.leaseUntil && job.leaseUntil < new Date())) {
      return importJobResponse(await runImportJob(id));
    }
    return importJobResponse(job);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
