import { ApiError } from "@/lib/api-guards";
import { handleTickets } from "@/lib/tickets/api";
import { parseBulkCsv, parseBulkRows } from "@/lib/tickets/bulk";
import { getTicketSettings } from "@/lib/tickets/settings.server";
import { readFirstSheet } from "@/lib/tickets/xlsx-read";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Leest een CSV- of Excel-bestand en geeft de gecontroleerde regels terug. Er wordt hier
 * niets opgeslagen: pas bij "Uitgeven" gaat de lijst (opnieuw gecontroleerd) naar de server.
 */
export async function POST(req: Request) {
  return handleTickets(["tickets:bulk"], async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Kies een CSV- of Excel-bestand.");
    if (file.size > MAX_BYTES) throw new ApiError(400, "Het bestand is groter dan 5 MB.");
    const name = file.name.toLowerCase();
    let result;
    if (name.endsWith(".xlsx")) {
      try {
        result = parseBulkRows(await readFirstSheet(await file.arrayBuffer()));
      } catch (e) {
        throw new ApiError(400, e instanceof Error ? e.message : "Het Excel-bestand kon niet worden gelezen.");
      }
    } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
      result = parseBulkCsv(await file.text());
    } else {
      throw new ApiError(400, "Alleen .csv en .xlsx worden ondersteund. Sla een .xls eerst op als .xlsx.");
    }
    const settings = await getTicketSettings();
    return { ...result, origin: name.endsWith(".xlsx") ? "XLSX" : "CSV", threshold: settings.bulkApprovalThreshold };
  });
}
