import { z } from "zod";
import { ApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { deliverTicketMail } from "./delivery.server";
import { hitLimit } from "./public-limit.server";

// Ticket zelf opnieuw opvragen ("ik ben mijn ticket kwijt"). Het ticket gaat alleen naar het adres dat al bij
// het ticket staat. Het antwoord is altijd hetzelfde, zodat niemand kan nagaan wie er tickets heeft.

const schema = z.object({ email: z.string().trim().toLowerCase().email("Vul een geldig e-mailadres in.").max(200) });

export const GENERIC_RESEND_MESSAGE = "Als er tickets op dit e-mailadres staan, sturen we ze opnieuw. Kijk ook even in je spam.";
const MAX_PER_REQUEST = 10;

export async function requestTicketResend(raw: unknown, ip: string) {
  const { email } = schema.parse(raw);
  if (await hitLimit("resend-ip", ip, 10, 3600_000)) throw new ApiError(429, "Te veel pogingen. Probeer het later opnieuw.");
  if (await hitLimit("resend-email", email, 3, 3600_000)) throw new ApiError(429, "Voor dit e-mailadres is zojuist al een aanvraag gedaan. Probeer het over een uur opnieuw.");
  const now = new Date();
  const tickets = await prisma.ticket.findMany({
    where: { email: { equals: email, mode: "insensitive" }, source: "HHC", status: "ACTIVE", anonymizedAt: null, OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
    orderBy: { createdAt: "desc" },
    take: MAX_PER_REQUEST,
    select: { id: true },
  });
  // Een mislukte mail (bijvoorbeeld op een preview zonder mailkoppeling) mag niets verraden over het adres.
  for (const t of tickets) await deliverTicketMail(t.id, { id: null, name: "Ticket opnieuw opgevraagd" }).catch(() => {});
  return { ok: true, message: GENERIC_RESEND_MESSAGE };
}

