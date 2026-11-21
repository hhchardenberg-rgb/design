"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Briefcase,
  Check,
  ChevronsUpDown,
  ExternalLink,
  Home,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  QrCode,
  Search,
  Settings,
  Sparkles,
  Ticket,
  UserRound,
  X,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { featuredModule, hubModuleGroups } from "@/lib/hub-modules";
import { visibleAdminGroups } from "@/lib/admin-modules";
import { visibleTicketingModules } from "@/lib/ticketing-modules";
import { hasAnyAdminRole, hasRole, resolveHomePath } from "@/lib/roles";
import { CommandPalette } from "@/components/shell/command-palette";
import { MatchChip } from "@/components/shell/match-chip";
import { InstallAppHint } from "@/components/install-app-hint";
import { pwaAppForSection } from "@/lib/pwa-apps";
import { iconForHref } from "@/components/shell/nav-icons";
import type { NextMatch, PlainNavGroup, ShellNavGroup, ShellNavItem, ShellSection } from "@/components/shell/types";

export interface CommercialShellState {
  /** Heeft de gebruiker toegang tot de sectie (server-side bepaald, flag + lidmaatschap). */
  member: boolean;
  /** Beheerder van Commerciële Zaken (rechtenbeheer) of hoofdadmin: mag naar Beheer. */
  admin: boolean;
  /** Menu van Commerciële Zaken, server-side gefilterd op rechten. */
  nav?: PlainNavGroup[];
}

const plain = (groups: PlainNavGroup[] | undefined): ShellNavGroup[] =>
  (groups ?? []).map((g) => ({ id: g.id, label: g.label, items: g.items.map((i) => ({ title: i.label, href: i.href, icon: iconForHref(i.href) })) }));

// De designtool heeft eigen pagina's (overzicht, nieuw, mijn ontwerpen); die
// staan als eerste groep in het Communicatie-menu, zodat je er met één klik bent.
const designtoolGroup: ShellNavGroup = {
  id: "designtool",
  label: "Designtool",
  items: [
    { title: "Overzicht designtool", href: "/dashboard", icon: featuredModule.icon },
    { title: "Nieuwe afbeelding", href: "/templates", icon: Sparkles },
    { title: "Mijn ontwerpen", href: "/designs", icon: FolderOpen },
  ],
};

function hubGroups(newsEnabled: boolean): ShellNavGroup[] {
  return [
    designtoolGroup,
    ...hubModuleGroups.map((g) => ({
      id: g.id,
      label: g.label,
      items: g.modules
        .filter((m) => m.id !== "nieuws" || newsEnabled)
        .map((m) => ({ title: m.title, href: m.href, icon: m.icon, status: m.status })),
    })),
  ].filter((g) => g.items.length > 0);
}

/** Langste overeenkomende pad wint, zodat "/tickets" niet oplicht op "/tickets/scans". */
function activeHref(pathname: string, section: ShellSection | undefined): string | null {
  if (!section) return null;
  const all = [section.href, ...section.groups.flatMap((g) => g.items.filter((i) => !i.external).map((i) => i.href))];
  let best: string | null = null;
  for (const href of all) {
    const hit = href === section.href ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    if (hit && (!best || href.length > best.length)) best = href;
  }
  // Designtool-pagina's die niet in het menu staan (bv. /templates/[slug]).
  if (!best && section.key === "hub" && pathname.startsWith("/templates")) best = "/templates";
  return best;
}

export function AppShell({
  children,
  commercial,
  tickets = false,
  ticketsNav,
  supportSearch = false,
  news,
  nextMatch = null,
}: {
  children: React.ReactNode;
  commercial: CommercialShellState;
  /** Toegang tot Tickets (server-side bepaald: flag + rol). */
  tickets?: boolean;
  /** Menu van Tickets, server-side gefilterd op rechten. */
  ticketsNav?: PlainNavGroup[];
  /** Mag de zoektool in Klantenservice gebruiken (Tickets-recht support:search). */
  supportSearch?: boolean;
  /** Of het nieuws van Communicatie en Klantenservice aan staat (server-side uit de database). */
  news: { hub: boolean; ticketing: boolean };
  /** Eerstvolgende wedstrijd, voor de wedstrijdchip in de kopbalk. */
  nextMatch?: NextMatch | null;
}) {
  const pathname = usePathname() ?? "";
  const { data: session } = useSession();
  const roles = useMemo(() => session?.user?.roles ?? [], [session?.user?.roles]);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  // Alle onderdelen waar deze gebruiker bij mag, met hun eigen menu.
  const sections = useMemo<ShellSection[]>(() => {
    const out: ShellSection[] = [];
    if (hasRole(roles, "HUB")) out.push({ key: "hub", label: "Communicatie", href: "/hub", icon: Megaphone, homeLabel: "Overzicht", groups: hubGroups(news.hub) });
    if (hasRole(roles, "TICKETING"))
      out.push({
        key: "ticketing",
        label: "Klantenservice",
        href: "/klantenservice",
        icon: Ticket,
        homeLabel: "Overzicht",
        groups: [{ id: "ticketing", label: "Onderdelen", items: visibleTicketingModules({ newsEnabled: news.ticketing, supportSearch }).map((m) => ({ title: m.title, href: m.href, icon: m.icon, status: m.status })) }],
      });
    if (commercial.member) out.push({ key: "commercial", label: "Commerciële Zaken", href: "/commercieel", icon: Briefcase, homeLabel: "Startpagina", groups: plain(commercial.nav) });
    if (tickets) out.push({ key: "tickets", label: "Tickets", href: "/tickets", icon: QrCode, homeLabel: "Dashboard", groups: plain(ticketsNav) });
    if (hasAnyAdminRole(roles) || commercial.admin)
      out.push({
        key: "admin",
        label: "Beheer",
        href: "/admin",
        icon: Settings,
        homeLabel: "Overzicht",
        groups: visibleAdminGroups(roles, commercial.admin).map((g) => ({ id: g.id, label: g.label, items: g.modules.map((m) => ({ title: m.title, href: m.href, icon: m.icon })) })),
      });
    return out;
  }, [roles, news.hub, news.ticketing, supportSearch, commercial.member, commercial.admin, commercial.nav, tickets, ticketsNav]);

  const homeHref = resolveHomePath(roles);
  const sectionKey = pathname.startsWith("/admin")
    ? "admin"
    : pathname.startsWith("/klantenservice")
      ? "ticketing"
      : pathname.startsWith("/commercieel")
        ? "commercial"
        : pathname === "/tickets" || pathname.startsWith("/tickets/")
          ? "tickets"
          : pathname.startsWith("/account")
            ? null
            : "hub";
  const isAccount = pathname.startsWith("/account");
  // Op profielpagina's houdt de zijbalk het menu van je startonderdeel.
  const section =
    sections.find((s) => s.key === sectionKey) ?? sections.find((s) => s.href === homeHref) ?? sections[0];
  const current = activeHref(pathname, section);
  const currentItem: ShellNavItem | undefined = section?.groups.flatMap((g) => g.items).find((i) => i.href === current);
  const crumb = isAccount ? "Profiel" : current === section?.href ? section?.homeLabel : currentItem?.title;
  // "Zet als app op je telefoon": alleen op de startpagina van een onderdeel waar deze gebruiker echt bij mag
  // (staat in sections), zodat de melding niet op elke pagina terugkomt.
  const installApp = sectionKey && section?.key === sectionKey && pathname === section.href ? pwaAppForSection(sectionKey) : null;

  // Sluit het uitschuifmenu bij navigeren.
  useEffect(() => setDrawer(false), [pathname]);

  // Ctrl/⌘ K opent de zoekbalk, overal in de Hub.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  const sidebar = (
    <Sidebar
      sections={sections}
      section={section}
      current={current}
      isAccount={isAccount}
      homeHref={homeHref}
      userName={session?.user?.name ?? session?.user?.email ?? ""}
      userEmail={session?.user?.email ?? ""}
      onSearch={() => setPalette(true)}
      onClose={drawer ? () => setDrawer(false) : undefined}
    />
  );

  return (
    <div className="min-h-screen lg:pl-[16.5rem]">
      {/* Vaste zijbalk vanaf lg */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[16.5rem] lg:block">{sidebar}</aside>

      {/* Uitschuifpaneel onder lg (geen swipe-menu: een knop opent het hele menu) */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setDrawer(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] shadow-2xl animate-drawer-in" role="dialog" aria-modal="true" aria-label="Menu">
            {sidebar}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-md supports-[backdrop-filter]:bg-surface/80">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-foreground hover:bg-surface-muted lg:hidden"
            aria-label="Menu openen"
            aria-expanded={drawer}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href={homeHref} className="flex shrink-0 items-center gap-2 lg:hidden" aria-label="HHC Hub, naar start">
            <Image src="/branding/hhc-logo.png" alt="" width={24} height={30} className="h-[30px] w-6" priority />
          </Link>
          <nav aria-label="Kruimelpad" className="flex min-w-0 items-center gap-1.5 text-sm">
            {section && !isAccount && (
              <Link href={section.href} className="hidden shrink-0 text-muted-foreground hover:text-foreground sm:inline">
                {section.label}
              </Link>
            )}
            {section && !isAccount && crumb && crumb !== section.homeLabel && <span className="hidden text-border-strong sm:inline" aria-hidden>/</span>}
            <span className={cn("truncate font-semibold", crumb === section?.homeLabel && "sm:hidden")}>{crumb === section?.homeLabel ? section?.label : (crumb ?? section?.label)}</span>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPalette(true)}
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground md:w-64 lg:w-72"
              aria-label="Zoek in de Hub (Ctrl K)"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Zoek in de Hub</span>
              <kbd className="ml-auto hidden rounded border border-border bg-surface px-1.5 text-[11px] font-medium md:inline">Ctrl K</kbd>
            </button>
            {nextMatch && <MatchChip match={nextMatch} />}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[84rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        {installApp && <InstallAppHint app={installApp} />}
        {children}
      </main>

      <CommandPalette open={palette} onClose={() => setPalette(false)} sections={sections} />
    </div>
  );
}

function Sidebar({
  sections,
  section,
  current,
  isAccount,
  homeHref,
  userName,
  userEmail,
  onSearch,
  onClose,
}: {
  sections: ShellSection[];
  section: ShellSection | undefined;
  current: string | null;
  isAccount: boolean;
  homeHref: string;
  userName: string;
  userEmail: string;
  onSearch: () => void;
  onClose?: () => void;
}) {
  const initials = userName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Link href={homeHref} className="flex min-w-0 items-center gap-3">
          <Image src="/branding/hhc-logo.png" alt="" width={30} height={38} className="h-[38px] w-[30px] shrink-0" priority />
          <span className="min-w-0 leading-tight">
            <span className="block font-heading text-[0.9375rem] font-bold tracking-[0.01em] text-white">HHC Hub</span>
            <span className="block text-xs text-sidebar-muted">Hardenberg</span>
          </span>
        </Link>
        {onClose && (
          <button type="button" onClick={onClose} className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-white" aria-label="Menu sluiten">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="px-3">
        <AppSwitcher sections={sections} active={isAccount ? undefined : section} />
      </div>

      <nav aria-label={section ? `Menu ${section.label}` : "Menu"} className="mt-3 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin]">
        {section && (
          <ul className="space-y-0.5">
            <NavLink item={{ title: section.homeLabel, href: section.href, icon: section.key === "tickets" ? LayoutDashboard : Home }} active={!isAccount && current === section.href} />
          </ul>
        )}
        {section?.groups.map((g) => (
          <div key={g.id} className="mt-5">
            <p className="eyebrow px-3 pb-1.5 text-[0.625rem] text-sidebar-muted/80">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((i) => (
                <NavLink key={i.href} item={i} active={!isAccount && current === i.href} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button type="button" onClick={onSearch} className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-white lg:hidden">
          <Search className="h-4 w-4" /> Zoeken
        </button>
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#262626] text-xs font-semibold text-white" aria-hidden>
            {initials || <UserRound className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-white">{userName}</span>
            {userEmail && userEmail !== userName && <span className="block truncate text-xs text-sidebar-muted">{userEmail}</span>}
          </span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Link
            href="/account/profiel"
            aria-current={isAccount ? "page" : undefined}
            className={cn("flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-white", isAccount && "bg-sidebar-active text-white")}
          >
            <UserRound className="h-3.5 w-3.5" /> Profiel
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" /> Uitloggen
          </button>
        </div>
      </div>
    </div>
  );
}

function NavLink({ item, active }: { item: ShellNavItem; active: boolean }) {
  const Icon = item.icon;
  const soon = item.status === "soon";
  const inner = (
    <>
      {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r-full bg-hhc-orange" />}
      {Icon ? (
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-hhc-orange" : "text-sidebar-muted group-hover:text-sidebar-foreground")} strokeWidth={1.85} />
      ) : (
        <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center">
          <span className={cn("h-1 w-1 rounded-full", active ? "bg-hhc-orange" : "bg-sidebar-muted")} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {item.external && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" aria-label="opent in nieuw tabblad" />}
      {soon && <span className="rounded border border-sidebar-border px-1.5 text-[10px] font-medium text-sidebar-muted">Binnenkort</span>}
    </>
  );
  const cls = cn(
    "group relative flex items-center gap-3 rounded-lg px-3 py-[0.4375rem] text-[0.8125rem] transition-colors",
    active ? "bg-sidebar-active font-semibold text-white" : "text-[#c9c7c1] hover:bg-sidebar-hover hover:text-white",
    soon && "pointer-events-none opacity-50",
  );
  return (
    <li>
      {item.external ? (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>
          {inner}
        </a>
      ) : (
        <Link href={item.href} aria-current={active ? "page" : undefined} className={cls} aria-disabled={soon || undefined} tabIndex={soon ? -1 : undefined}>
          {inner}
        </Link>
      )}
    </li>
  );
}

/** Wisselen tussen de onderdelen van de Hub, alsof het losse apps zijn. */
function AppSwitcher({ sections, active }: { sections: ShellSection[]; active: ShellSection | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ActiveIcon = active?.icon ?? UserRound;
  const label = active?.label ?? "Profiel";
  const canSwitch = sections.length > 1 || !active;

  const face = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-hhc-orange text-black">
        <ActiveIcon className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-white">{label}</span>
      {canSwitch && <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-muted" />}
    </>
  );

  if (!canSwitch) return <div className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-[#141414] px-2.5 py-2">{face}</div>;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Onderdeel: ${label}. Wissel van onderdeel`}
        className={cn("flex w-full items-center gap-3 rounded-lg border border-sidebar-border bg-[#141414] px-2.5 py-2 transition-colors hover:border-[#333] hover:bg-[#181818]", open && "border-[#333] bg-[#181818]")}
      >
        {face}
      </button>
      {open && (
        <div role="menu" className="absolute inset-x-0 top-full z-40 mt-1.5 rounded-xl border border-[#262626] bg-[#141414] p-1.5 shadow-[0_18px_40px_-10px_rgba(0,0,0,0.7)] animate-panel-in">
          <p className="eyebrow px-2.5 pt-1.5 pb-2 text-[0.625rem] text-sidebar-muted">Onderdelen van de Hub</p>
          {sections.map((s) => {
            const Icon = s.icon;
            const on = s.key === active?.key;
            return (
              <Link
                key={s.key}
                href={s.href}
                role="menuitem"
                aria-current={on ? "page" : undefined}
                className={cn("flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors", on ? "bg-sidebar-active text-white" : "text-[#d6d4cf] hover:bg-sidebar-hover hover:text-white")}
              >
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", on ? "bg-hhc-orange text-black" : "bg-[#222] text-[#d6d4cf]")}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 font-medium">{s.label}</span>
                {on && <Check className="h-4 w-4 text-hhc-orange" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
