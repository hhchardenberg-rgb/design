import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDay, formatDayTime } from "@/lib/date-format";
import { publicTicketByToken, qrSvg } from "@/lib/tickets/delivery.server";
import { isTicketsEnabled } from "@/lib/tickets/flag";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jouw ticket – HHC Hardenberg", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PublicTicketPage({ params }: { params: Promise<{ token: string }> }) {
  if (!isTicketsEnabled()) notFound();
  const { token } = await params;
  const t = await publicTicketByToken(decodeURIComponent(token));
  if (!t) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Deze ticketlink werkt niet meer</h1>
        <p className="mt-3 text-sm text-neutral-600">De link is ingetrokken of niet juist. Vraag HHC Hardenberg om je ticket opnieuw te sturen.</p>
      </main>
    );
  }
  const svg = t.usable ? await qrSvg(t.qr) : null;
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="bg-[#f26a21] px-5 py-4 text-white">
          <p className="text-lg font-bold">HHC Hardenberg</p>
          <p className="text-sm opacity-90">{t.typeName}</p>
        </div>
        <div className="space-y-4 p-5">
          {svg ? (
            <div className="mx-auto w-full max-w-[280px] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label="QR-code van je ticket" />
          ) : (
            <p className="rounded-md bg-red-50 p-3 text-center text-sm font-medium text-red-800">Dit ticket is niet geldig ({t.statusLabel.toLowerCase()}).</p>
          )}
          <div className="text-center">
            <p className="text-lg font-semibold">{t.name}</p>
            <p className="text-sm text-neutral-600">{t.validity}</p>
            {t.zone && <p className="text-sm text-neutral-600">Vak: {t.zone}</p>}
            {t.validUntil && <p className="text-xs text-neutral-500">Geldig t/m {formatDayTime(t.validUntil)}</p>}
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
              <a href={`/t/${token}/pdf`} className="rounded-md border border-neutral-300 px-4 py-2 text-center text-sm font-medium">Download als PDF</a>
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-neutral-500">Persoonlijk ticket. Laat de QR-code niet door anderen scannen of kopiëren.</p>
    </main>
  );
}
