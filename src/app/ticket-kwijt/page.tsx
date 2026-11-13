import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { ResendForm } from "./resend-form";

export const metadata: Metadata = { title: "Ticket kwijt – HHC Hardenberg", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function TicketLostPage() {
  if (!isTicketsEnabled()) notFound();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-10">
      <ResendForm />
    </main>
  );
}
