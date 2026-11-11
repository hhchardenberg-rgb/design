import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { TemplatesForm } from "./templates-form";

export const metadata: Metadata = { title: "E-mail en wallet – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const a = await ticketsPageAccess("templates:manage");
  if (!a.allowed) return <NoAccess what="de e-mailtemplates van HHC Tickets" />;
  return <TemplatesForm />;
}
