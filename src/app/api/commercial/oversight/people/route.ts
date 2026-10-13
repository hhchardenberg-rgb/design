import { handle } from "@/lib/commercial/api";
import { listPeople } from "@/lib/commercial/oversight.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async (ctx) => ({ people: await listPeople(ctx) }));
}
