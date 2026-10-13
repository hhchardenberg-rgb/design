import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, ApiError } from "@/lib/api-guards";
import { isNewsSection } from "@/lib/news";
import { requireNewsRight } from "@/lib/news.server";

/** Zet het nieuws van één onderdeel aan of uit. Alleen voor de beheerders van dat onderdeel. */
export async function PUT(req: Request) {
  try {
    const data = (await req.json().catch(() => null)) as { section?: unknown; enabled?: unknown } | null;
    if (!data || !isNewsSection(data.section) || typeof data.enabled !== "boolean") throw new ApiError(400, "Ongeldige invoer.");
    const section = data.section;
    const { user } = await requireNewsRight(section, "canToggle");
    await prisma.newsSectionSetting.upsert({
      where: { section },
      update: { enabled: data.enabled, updatedById: user.id },
      create: { section, enabled: data.enabled, updatedById: user.id },
    });
    // De Communicatie-startpagina wordt 15 minuten gecachet; meteen bijwerken.
    revalidatePath("/hub");
    return NextResponse.json({ ok: true, enabled: data.enabled });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
