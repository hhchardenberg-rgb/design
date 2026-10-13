import { handle } from "@/lib/commercial/api";
import { findActivities } from "@/lib/commercial/activities.server";

export const dynamic = "force-dynamic";

/** Contactmomenten zoeken, actief of gearchiveerd, in één dossier of in alle dossiers binnen bereik. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle((ctx) =>
    findActivities(ctx, { archived: p.get("archived") === "1", q: p.get("q") ?? undefined, companyId: p.get("companyId") || undefined }),
  );
}
