import { AppShell, type CommercialShellState } from "@/components/app-shell";
import { auth } from "@/lib/auth";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { COMMERCIAL_NAV } from "@/lib/commercial/navigation";

// Alle pagina's hier vereisen een ingelogde gebruiker en actuele
// databasedata (templates, wedstrijden, ontwerpen) en mogen dus nooit
// statisch geprerenderd worden.
export const dynamic = "force-dynamic";

// Of Commerciële Zaken in het menu verschijnt wordt hier server-side bepaald
// (flag + lidmaatschap uit de database), niet uit het JWT.
async function commercialState(): Promise<CommercialShellState> {
  if (!isCommercialEnabled()) return { member: false, nav: [], showAdminLink: false };
  const session = await auth();
  const user = session?.user;
  if (!user) return { member: false, nav: [], showAdminLink: false };
  const access = await loadCommercialAccess(user.id);
  return {
    member: access.isMember,
    nav: access.isMember ? COMMERCIAL_NAV.filter((i) => !i.requires || access.can(i.requires)).map(({ href, label }) => ({ href, label })) : [],
    showAdminLink: user.roles.includes("ADMIN"),
  };
}

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell commercial={await commercialState()}>{children}</AppShell>;
}
