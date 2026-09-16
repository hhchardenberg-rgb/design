import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { buildPersberichtDocx } from "@/lib/persbericht/buildDocx";

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "persbericht"
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const release = await prisma.pressRelease.findUnique({ where: { id } });
    if (!release) throw new ApiError(404, "Persbericht niet gevonden.");

    const buffer = await buildPersberichtDocx(release);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${slugify(release.title)}.docx"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
