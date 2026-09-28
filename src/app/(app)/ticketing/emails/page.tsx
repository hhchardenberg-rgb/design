import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { EmailTemplateBrowser } from "@/components/email-template-browser";

export const metadata: Metadata = { title: "Standaard e-mails · Ticketing" };

export default async function TicketingEmailsPage() {
  const templates = await prisma.ticketingEmailTemplate.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Standaard e-mails</h1>
        <p className="mt-1 text-muted-foreground">
          Kant-en-klare e-mailteksten voor veelvoorkomende situaties. Kopieer en plak in je mailprogramma.
        </p>
      </div>
      <EmailTemplateBrowser templates={templates} />
    </div>
  );
}
