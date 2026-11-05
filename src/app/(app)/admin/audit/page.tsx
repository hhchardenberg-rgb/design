import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { AuditLogPanel } from "@/components/audit/audit-log-panel";

export const metadata: Metadata = { title: "Audit-log" };

export default async function AdminAuditPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/audit");
  if (!hasRole(session.user.roles, "ADMIN")) redirect("/admin");
  return <AuditLogPanel />;
}
