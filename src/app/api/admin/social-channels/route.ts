import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHubAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { listSocialChannels } from "@/lib/social-channels.server";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS, normalizeSocialUrl } from "@/lib/social-channels";

export async function GET() {
  try {
    await requireHubAdmin();
    return NextResponse.json({ channels: await listSocialChannels() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Slaat alle kanalen in één keer op: { urls: { facebook: "https://...", instagram: "" } }. Leeg = verwijderen. */
export async function PUT(req: Request) {
  try {
    const user = await requireHubAdmin();
    const body = (await req.json().catch(() => null)) as { urls?: Record<string, unknown> } | null;
    const urls = body?.urls;
    if (!urls || typeof urls !== "object") throw new ApiError(400, "Ongeldige invoer.");

    const upserts: { platform: string; url: string }[] = [];
    const deletes: string[] = [];
    for (const platform of SOCIAL_PLATFORMS) {
      const raw = urls[platform];
      if (raw === undefined) continue;
      if (typeof raw !== "string") throw new ApiError(400, "Ongeldige invoer.");
      if (!raw.trim()) {
        deletes.push(platform);
        continue;
      }
      const url = normalizeSocialUrl(raw);
      if (!url) throw new ApiError(400, `De link voor ${SOCIAL_PLATFORM_LABELS[platform]} is geen geldig webadres.`);
      upserts.push({ platform, url });
    }

    await prisma.$transaction([
      prisma.socialChannel.deleteMany({ where: { platform: { in: deletes } } }),
      ...upserts.map(({ platform, url }) =>
        prisma.socialChannel.upsert({
          where: { platform },
          create: { platform, url, updatedById: user.id },
          update: { url, updatedById: user.id },
        })
      ),
    ]);
    revalidatePath("/hub");

    return NextResponse.json({ channels: await listSocialChannels() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
