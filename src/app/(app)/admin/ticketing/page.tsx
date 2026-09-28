import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Mail } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = { title: "Ticketing" };

const sections = [
  {
    href: "/admin/ticketing/handleidingen",
    title: "Handleidingen",
    description: "Stap-voor-stap-instructies en procedures voor het ticketingsysteem.",
    icon: BookOpen,
  },
  {
    href: "/admin/ticketing/emails",
    title: "Standaard e-mails",
    description: "Kant-en-klare e-mailteksten voor veelvoorkomende situaties.",
    icon: Mail,
  },
];

export default function AdminTicketingOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Ticketing</h1>
        <p className="mt-1 text-muted-foreground">Beheer de inhoud van het afgeschermde Ticketing-gedeelte.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-hhc-orange-dark">
                  <s.icon className="h-5 w-5" />
                </div>
                <CardTitle className="mt-1">{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
