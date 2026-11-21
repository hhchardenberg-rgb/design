import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { loadTicketsAccess } from "@/lib/tickets/authz.server";
import { PWA_APPS, type PwaApp } from "@/lib/pwa-apps";

export const metadata: Metadata = { title: "Apps op je telefoon" };
export const dynamic = "force-dynamic";

/** Alleen de apps van onderdelen waar deze gebruiker bij mag; dezelfde regels als het menu. */
async function availableApps(): Promise<PwaApp[]> {
  const session = await auth();
  const user = session?.user;
  if (!user) return [];
  const roles = user.roles ?? [];
  const [commercial, tickets] = await Promise.all([
    isCommercialEnabled() ? loadCommercialAccess(user.id) : null,
    isTicketsEnabled() ? loadTicketsAccess(user.id) : null,
  ]);
  const out: PwaApp[] = [];
  if (hasRole(roles, "HUB")) out.push(PWA_APPS.communicatie);
  if (commercial?.isMember) out.push(PWA_APPS.commercieel);
  if (hasRole(roles, "TICKETING")) out.push(PWA_APPS.klantenservice);
  if (tickets?.hasAccess) out.push(PWA_APPS.tickets);
  if (tickets?.can("scan:scan")) out.push(PWA_APPS.scanner);
  return out;
}

export default async function AppsPage() {
  const apps = await availableApps();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Apps op je telefoon</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zet een onderdeel van de Hub als losse app op je beginscherm. Hij opent dan direct in dat onderdeel, met een eigen icoon en zonder adresbalk.
          Je ziet hier alleen de onderdelen waar je toegang toe hebt.
        </p>
      </div>

      {apps.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">Je hebt nog geen toegang tot een onderdeel dat als app beschikbaar is.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {apps.map((app) => (
            <li key={app.key} className="flex items-center gap-3 p-3 sm:p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- klein vast icoon uit /public */}
              <img src={`/apps/${app.key}/icon-192.png`} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{app.shortName}</p>
                <p className="text-sm text-muted-foreground">{app.description}</p>
              </div>
              {/* Gewone link (geen client-navigatie), zodat de telefoon zeker het manifest van deze app ziet. */}
              <a href={app.startUrl} className="shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:border-border-strong">
                Openen
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">iPhone en iPad</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Open het onderdeel in Safari (tik hierboven op Openen).</li>
            <li>Tik op Deel, het vierkantje met de pijl omhoog.</li>
            <li>Kies Zet op beginscherm en tik op Voeg toe.</li>
          </ol>
          <p className="mt-2 text-sm text-muted-foreground">Elke app heeft op de iPhone zijn eigen opslag, dus je logt er één keer apart in.</p>
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Android</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Open het onderdeel in Chrome (tik hierboven op Openen).</li>
            <li>Tik op Installeren in de melding bovenaan, of open het menu ⋮.</li>
            <li>Kies App installeren of Toevoegen aan startscherm.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
