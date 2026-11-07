import { prisma } from "@/lib/prisma";
import { isSocialPlatform, sortSocialChannels, type SocialChannel } from "@/lib/social-channels";

/** Alle kanalen met een ingestelde link, in vaste volgorde. */
export async function listSocialChannels(): Promise<SocialChannel[]> {
  const rows = await prisma.socialChannel.findMany();
  return sortSocialChannels(
    rows.flatMap((r) => (isSocialPlatform(r.platform) && r.url ? [{ platform: r.platform, url: r.url }] : []))
  );
}
