import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { setContractStatus } from "@/lib/commercial/contracts.server";
import { notifyContractActivated } from "@/lib/commercial/notifications.server";
import { sendContractNoticeEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    const status = z.object({ status: z.enum(["ACTIVE", "ENDED", "CANCELLED"]) }).parse(body).status;
    const contract = await setContractStatus(ctx, id, status);
    // Nieuw contract afgesloten: aangewezen mensen krijgen een melding (alleen echt verstuurd op productie).
    const notified = status === "ACTIVE" ? await notifyContractActivated(id, ctx.userId, sendContractNoticeEmail) : null;
    return { contract, notified };
  });
}
