import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { asLocale, isLocale, LOCALES, textsFor } from "@/lib/tickets/i18n";
import { ticketByToken } from "@/lib/tickets/design/public.server";
import { ticketView } from "@/lib/tickets/design/context.server";
import { MobileTicket } from "@/components/tickets/design/mobile-ticket";

export const dynamic = "force-dynamic";
// Persoonlijke tickets nooit in zoekmachines of gedeelde caches.
export const metadata: Metadata = { title: "Jouw ticket – HHC Hardenberg", robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }, referrer: "no-referrer" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default async function PublicTicketPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  if (!isTicketsEnabled()) notFound();
  const { token } = await params;
  const { lang } = await searchParams;
  // Een kapotte %-codering (bijvoorbeeld een link die onderweg is afgekapt) is gewoon een ongeldige link.
  let decoded: string | null = null;
  try {
    decoded = decodeURIComponent(token);
  } catch {
    decoded = null;
  }
  const t = decoded ? await ticketByToken(decoded) : null;
  const tx = textsFor(lang ?? t?.locale);
  if (!t) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{tx.invalidLinkTitle}</h1>
        <p className="mt-3 text-sm text-neutral-600">{tx.invalidLinkBody}</p>
      </main>
    );
  }
  const locale = asLocale(lang ?? t.locale);
  const { view } = await ticketView(t, "mobile", undefined, locale);
  const labels = { ...tx.ui, personalNote: tx.personalNote };
  return (
    <main className="min-h-dvh" style={{ background: view.style.page }} lang={locale}>
      <nav className="mx-auto flex max-w-md justify-end gap-3 px-3 pt-2 text-xs font-semibold" aria-label={tx.v.langNav}>
        {(Object.keys(LOCALES) as (keyof typeof LOCALES)[]).map((l) => (
          <a key={l} href={`?lang=${l}`} aria-current={locale === l ? "true" : undefined} className={`inline-flex min-h-8 items-center px-1 ${locale === l ? "underline" : "opacity-70"}`} style={{ color: "#1C1917" }}>
            {l.toUpperCase()}
          </a>
        ))}
      </nav>
      <MobileTicket view={view} labels={labels} pdfHref={view.usable ? `/t/${token}/pdf${lang && isLocale(lang) ? `?lang=${lang}` : ""}` : null} offline />
    </main>
  );
}
