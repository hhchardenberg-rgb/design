import { ApiError } from "@/lib/api-guards";
import { handle } from "@/lib/commercial/api";
import { listFiles, uploadFile, MAX_FILE_BYTES } from "@/lib/commercial/files.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const history = new URL(req.url).searchParams.get("history") === "1";
  return handle(async (ctx) => ({ files: await listFiles(ctx, id, { history }) }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async (ctx) => {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_FILE_BYTES + 64 * 1024) throw new ApiError(413, "Het bestand is groter dan 4 MB.");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) throw new ApiError(400, "Kies een bestand om te uploaden.");
    const replacesId = String(form.get("replacesId") ?? "") || null;
    const created = await uploadFile(ctx, id, {
      name: file.name,
      data: Buffer.from(await file.arrayBuffer()),
      category: String(form.get("category") ?? "OTHER"),
      note: String(form.get("note") ?? "") || null,
      replacesId,
    });
    return { file: created };
  });
}
