import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { BackupsPanel } from "@/components/backup/backups-panel";

export const metadata: Metadata = { title: "Back-ups" };

/** Alleen de hoofdadmin: een back-up bevat álle gegevens van de Hub. */
export default async function AdminBackupsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/backups");
  if (!hasRole(session.user.roles, "ADMIN")) redirect("/admin");
  return <BackupsPanel />;
}
