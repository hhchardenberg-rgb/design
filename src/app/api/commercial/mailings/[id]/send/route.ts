import { ApiError } from "@/lib/api-guards";
import { handle } from "@/lib/commercial/api";
import { isPreviewDeployment, sendMailingEmail } from "@/lib/mail";
import { sendMailing } from "@/lib/commercial/mailings.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => {
    if (isPreviewDeployment()) throw new ApiError(409, "In een preview worden geen mailings, facturen of meldingen verstuurd: de preview deelt de database met de echte Hub. Verstuur dit vanuit hub.hhc-hardenberg.nl.");
    return sendMailing(ctx, id, sendMailingEmail);
  });
}
