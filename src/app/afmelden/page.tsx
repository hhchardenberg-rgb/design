import type { Metadata } from "next";
import { readUnsubscribeParams } from "@/lib/commercial/mail-security";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = { title: "Afmelden – HHC Hardenberg" };
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ e?: string; t?: string }> }) {
  const { e, t } = await searchParams;
  const email = e && t ? readUnsubscribeParams(e, t) : null;
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold">Afmelden voor mailings</h1>
      {email && e && t ? (
        <UnsubscribeForm e={e} t={t} email={email} />
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Deze afmeldlink is ongeldig of verlopen. Gebruik de link uit de laatste e-mail, of neem contact op met HHC Hardenberg.</p>
      )}
    </main>
  );
}
