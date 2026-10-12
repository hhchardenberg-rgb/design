import { handle } from "@/lib/commercial/api";
import { listPackages, savePackage } from "@/lib/commercial/contracts.server";
import { packageSchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async (ctx) => ({ packages: await listPackages(ctx) }));
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: await savePackage(ctx, null, packageSchema.parse(body)) }));
}
