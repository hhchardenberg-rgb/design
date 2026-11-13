import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { ClaimForm } from "./claim-form";

export const metadata: Metadata = { title: "Actie – HHC Hardenberg", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PromoPage({ params }: { params: Promise<{ code: string }> }) {
  if (!isTicketsEnabled()) notFound();
  const { code } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-10">
      <ClaimForm code={decodeURIComponent(code)} />
    </main>
  );
}
