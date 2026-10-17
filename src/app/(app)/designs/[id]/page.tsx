import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessDesign } from "@/lib/design/permissions";

/** Korte link naar een ontwerp (bv. vanuit een batch): opent de editor. */
export default async function OpenDesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const design = await prisma.generatedDesign.findUnique({
    where: { id },
    select: { id: true, userId: true, templateVersion: { select: { template: { select: { slug: true } } } } },
  });
  if (!design || !canAccessDesign(session!.user, design)) notFound();
  redirect(`/templates/${design.templateVersion.template.slug}/create?designId=${design.id}`);
}
