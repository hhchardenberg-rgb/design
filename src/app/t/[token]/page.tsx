import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDay, formatDayTime } from "@/lib/date-format";
import { publicTicketByToken, qrSvg } from "@/lib/tickets/delivery.server";
import { asLocale, LOCALES, textsFor } from "@/lib/tickets/i18n";
import { isTicketsEnabled } from "@/lib/tickets/flag";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jouw ticket – HHC Hardenberg", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PublicTicketPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  if (!isTicketsEnabled()) notFound();
  const { token } = await params;
  const { lang } = await searchParams;
  const t = await publicTicketByToken(decodeURIComponent(token));
  const tx = textsFor(lang ?? t?.locale);
  if (!t) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{tx.invalidLinkTitle}</h1>
        <p className="mt-3 text-sm text-neutral-600">{tx.invalidLinkBody}</p>
      </main>
    );
  }
  const svg = t.usable ? await qrSvg(t.qr) : null;
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-start justify-between bg-[#f26a21] px-5 py-4 text-white">
          <div>
          <p className="text-lg font-bold">HHC Hardenberg</p>
          <p className="text-sm opacity-90">{t.typeName}</p>
          </div>
          <nav className="flex gap-2 text-xs font-semibold" aria-label="Language">
            {(Object.keys(LOCALES) as (keyof typeof LOCALES)[]).map((l) => (
              <a key={l} href={`?lang=${l}`} className={asLocale(lang ?? t.locale) === l ? "underline" : "opacity-80"}>{l.toUpperCase()}</a>
            ))}
          </nav>
        </div>
        <div className="space-y-4 p-5">
          {svg ? (
            <div className="mx-auto w-full max-w-[280px] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label={tx.qrAlt} />
          ) : (
            <p className="rounded-md bg-red-50 p-3 text-center text-sm font-medium text-red-800">{tx.notValid(tx.status[t.status])}</p>
          )}
          <div className="text-center">
            <p className="text-lg font-semibold">{t.name}</p>
            <p className="text-sm text-neutral-600">{t.validity}</p>
            {t.zone && <p className="text-sm text-neutral-600">{tx.zone}: {t.zone}</p>}
            {t.validUntil && <p className="text-xs text-neutral-500">{tx.validUntil} {formatDayTime(t.validUntil)}</p>}
          </div>
          {t.events.length > 1 && (
            <ul className="space-y-1 border-t border-neutral-200 pt-3 text-sm">
              {t.events.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{e.title}</span>
                  <span className="text-neutral-500">{formatDay(e.startsAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {t.usable && (
            <div className="flex flex-col gap-2 pt-1">
              <a href={`/t/${token}/pdf${lang ? `?lang=${asLocale(lang)}` : ""}`} className="rounded-md border border-neutral-300 px-4 py-2 text-center text-sm font-medium">{tx.downloadPdf}</a>
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-neutral-500">{tx.personalNote}</p>
    </main>
  );
}
