import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/api-guards";
import { hasRole, isSectionAdmin, type AppRole } from "@/lib/roles";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { NEWS_SECTION_KEYS, type NewsEnabledMap, type NewsSection } from "@/lib/news";

// Server-side kant van het nieuws per onderdeel: aan/uit-instelling, rechten en ophalen.
// Rechten volgen het onderdeel:
//  - Communicatie: lezen met HUB, schrijven en aan/uit als communicatiebeheerder.
//  - Ticketing: lezen met TICKETING, schrijven en aan/uit als ticketingbeheerder.
//  - Commerciële Zaken: lezen als lid, schrijven met news:create/update/archive,
//    aan/uit met settings:manage_settings.
// De hoofdadmin mag overal alles.

export async function loadNewsEnabled(): Promise<NewsEnabledMap> {
  const rows = await prisma.newsSectionSetting.findMany();
  const map = Object.fromEntries(NEWS_SECTION_KEYS.map((s) => [s, true])) as NewsEnabledMap;
  for (const r of rows) if (r.section in map) map[r.section as NewsSection] = r.enabled;
  if (!isCommercialEnabled()) map.commercial = false;
  return map;
}

export async function isNewsEnabled(section: NewsSection): Promise<boolean> {
  return (await loadNewsEnabled())[section];
}

export interface NewsRights {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canToggle: boolean;
}

const NONE: NewsRights = { canRead: false, canCreate: false, canUpdate: false, canDelete: false, canToggle: false };

export async function newsRights(user: { id: string; roles?: AppRole[] | null }, section: NewsSection): Promise<NewsRights> {
  const roles = user.roles ?? [];
  if (section === "commercial") {
    if (!isCommercialEnabled()) return NONE;
    const access = await loadCommercialAccess(user.id);
    if (!access.isMember) return NONE;
    return {
      canRead: true,
      canCreate: access.can("news:create"),
      canUpdate: access.can("news:update"),
      canDelete: access.can("news:archive"),
      canToggle: access.can("settings:manage_settings"),
    };
  }
  const admin = isSectionAdmin(roles, section);
  return {
    canRead: hasRole(roles, section === "hub" ? "HUB" : "TICKETING"),
    canCreate: admin,
    canUpdate: admin,
    canDelete: admin,
    canToggle: admin,
  };
}

/** Vereist een bepaald nieuwsrecht binnen een onderdeel; geeft de ingelogde gebruiker terug. */
export async function requireNewsRight(section: NewsSection, right: keyof NewsRights) {
  if (section === "commercial" && !isCommercialEnabled()) throw new ApiError(404, "Niet gevonden.");
  const user = await requireUser();
  const rights = await newsRights(user, section);
  if (!rights[right]) throw new ApiError(403, "Je hebt hiervoor geen rechten binnen dit onderdeel.");
  return { user, rights };
}

export async function listNewsPosts(section: NewsSection, take?: number) {
  const posts = await prisma.newsPost.findMany({
    where: { section },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take,
    include: { author: { select: { name: true } } },
  });
  return posts.map(({ author, ...post }) => ({ ...post, authorName: author?.name ?? null }));
}
