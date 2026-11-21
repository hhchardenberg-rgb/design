import type { Metadata } from "next";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { ModuleIndex } from "@/components/module-index";
import { visibleAdminGroups } from "@/lib/admin-modules";
import { auth } from "@/lib/auth";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { hasAnyAdminRole } from "@/lib/roles";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Beheer" };

export default async function AdminOverviewPage() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  const commercialAdmin = isCommercialEnabled() && (await loadCommercialAccess(session.user.id)).can("rights:manage_rights");
  if (!hasAnyAdminRole(roles) && !commercialAdmin) redirect("/geen-toegang");
  const visibleGroups = visibleAdminGroups(roles, commercialAdmin);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Beheer" title="Beheer van de Hub" description="Alles wat je binnen de HHC Hardenberg Hub kunt inrichten en beheren, op basis van jouw rechten." />
      {visibleGroups.map((group) => (
        <section key={group.id}>
          <SectionHeader title={group.label} />
          <ModuleIndex items={group.modules.map((m) => ({ key: m.href, title: m.title, description: m.description, href: m.href, icon: m.icon }))} />
        </section>
      ))}
    </div>
  );
}
