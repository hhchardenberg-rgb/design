import { z } from "zod";

const LEVEL = z.enum(["NONE", "USER", "ADMIN"]);

/** Invoer voor een rol aanmaken of wijzigen. `commercial: null` = geen toegang tot Commerciële Zaken. */
export const roleSchema = z.object({
  name: z.string().trim().min(1, "Geef de rol een naam.").max(80, "Een rolnaam is maximaal 80 tekens."),
  description: z.string().trim().max(300).nullable().optional(),
  hubLevel: LEVEL,
  ticketingLevel: LEVEL,
  commercial: z.array(z.string()).nullable(),
});
