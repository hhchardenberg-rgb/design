import { handle } from "@/lib/commercial/api";
import { listDeletedCompanies } from "@/lib/commercial/deleted-archive.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  return handle((ctx) => listDeletedCompanies(ctx, { q }));
}
