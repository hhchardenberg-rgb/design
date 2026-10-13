import { handle, num } from "@/lib/commercial/api";
import { COMPANY_STATUSES, createCompany, listCompanies } from "@/lib/commercial/companies.server";
import { companySchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";


export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle((ctx) =>
    listCompanies(ctx, {
      q: p.get("q")?.trim() || undefined,
      status: COMPANY_STATUSES.find((s) => s === p.get("status")),
      ownerId: p.get("ownerId") || undefined,
      mine: p.get("mine") === "1",
      tag: p.get("tag") || undefined,
      tiers: p.get("tiers")?.split(",").filter(Boolean),
      noAction: p.get("noAction") === "1",
      archived: p.get("archived") === "1",
      sort: (["name", "city", "status", "updatedAt", "sponsorTier"] as const).find((s) => s === p.get("sort")),
      dir: p.get("dir") === "desc" ? "desc" : "asc",
      page: num(p.get("page")),
      pageSize: num(p.get("pageSize")),
    }),
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    const parsed = companySchema.parse(body);
    const company = await createCompany(ctx, parsed);
    return { id: company.id };
  });
}
