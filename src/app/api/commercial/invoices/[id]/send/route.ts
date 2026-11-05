import { ApiError } from "@/lib/api-guards";
import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { getSendDefaults, sendDocument } from "@/lib/commercial/invoicing.server";
import { isPreviewDeployment, sendInvoiceEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

const schema = z.object({ to: z.string(), subject: z.string(), bodyText: z.string() });

/** Voorstel voor de mail, contacten met een e-mailadres en eerdere verzendpogingen. */
export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  return handle((ctx) => getSendDefaults(ctx, id));
}

export async function POST(req: Request, { params }: P) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    if (isPreviewDeployment()) throw new ApiError(409, "In een preview worden geen mailings, facturen of meldingen verstuurd: de preview deelt de database met de echte Hub. Verstuur dit vanuit hub.hhc-hardenberg.nl.");
    await sendDocument(ctx, id, schema.parse(body), sendInvoiceEmail);
  });
}
