import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/api-guards";
import { hasRole, isSectionAdmin, type AppRole } from "@/lib/roles";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { NEWS_SECTION_KEYS, isNewsSection, type NewsEnabledMap, type NewsRights, type NewsRightsMap, type NewsSection } from "@/lib/news";

// Server-side kant van de nieuwsmodule: aan/uit per onderdeel, rechten en ophalen.
// Eén bericht kan bij meerdere onderdelen staan. Rechten gelden per onderdeel:
//  - Communicatie: lezen met HUB, publiceren en aan/uit als communicatiebeheerder.
//  - Ticketing: lezen met TICKETING, publiceren en aan/uit als ticketingbeheerder.
//  - Commerciële Zaken: lezen als lid, publiceren met news:create/update/archive,
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

const NONE: NewsRights = { canRead: false, canCreate: false, canUpdate: false, canDelete: false, canToggle: false };

/** De nieuwsrechten van deze gebruiker voor elk onderdeel. */
export async function loadNewsRights(user: { id: string; roles?: AppRole[] | null }): Promise<NewsRightsMap> {
  const roles = user.roles ?? [];
  const sectionRights = (section: "hub" | "ticketing"): NewsRights => {
    const admin = isSectionAdmin(roles, section);
    return {
      canRead: hasRole(roles, section === "hub" ? "HUB" : "TICKETING"),
      canCreate: admin,
      canUpdate: admin,
      canDelete: admin,
      canToggle: admin,
    };
  };
  let commercial = NONE;
  if (isCommercialEnabled()) {
    const access = await loadCommercialAccess(user.id);
    if (access.isMember) {
      commercial = {
        canRead: true,
        canCreate: access.can("news:create"),
        canUpdate: access.can("news:update"),
        canDelete: access.can("news:archive"),
        canToggle: access.can("settings:manage_settings"),
      };
    }
  }
  return { hub: sectionRights("hub"), ticketing: sectionRights("ticketing"), commercial };
}

/** Mag deze gebruiker iets in de nieuwsmodule beheren (in welk onderdeel dan ook)? */
export function canManageAnyNews(rights: NewsRightsMap): boolean {
  return NEWS_SECTION_KEYS.some((s) => rights[s].canCreate || rights[s].canUpdate || rights[s].canDelete || rights[s].canToggle);
}

/** De onderdelen waarvoor de gebruiker dit recht heeft. */
export function sectionsWith(rights: NewsRightsMap, right: keyof NewsRights): NewsSection[] {
  return NEWS_SECTION_KEYS.filter((s) => rights[s][right]);
}

/** Vereist dat de ingelogde gebruiker iets in de nieuwsmodule mag beheren; geeft gebruiker en rechten terug. */
export async function requireNewsManager() {
  const user = await requireUser();
  const rights = await loadNewsRights(user);
  if (!canManageAnyNews(rights)) throw new ApiError(403, "Je hebt geen rechten om nieuws te beheren.");
  return { user, rights };
}

export async function listNewsPosts(section: NewsSection, take?: number) {
  const posts = await prisma.newsPost.findMany({
    where: { sections: { has: section } },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take,
    include: { author: { select: { name: true } } },
  });
  return posts.map(({ author, ...post }) => ({ ...post, authorName: author?.name ?? null }));
}

/** De gekozen onderdelen uit een formulier (veld "sections", meerdere keren). */
export function sectionsFromForm(form: FormData): NewsSection[] {
  const values = form.getAll("sections").map(String).filter(Boolean);
  if (!values.every(isNewsSection)) throw new ApiError(400, "Onbekend onderdeel.");
  return [...new Set(values as NewsSection[])];
}
