// Catalogus van alle bevoegdheden binnen Commerciële Zaken. Bewust zonder
// imports (pure TypeScript) zodat dit zowel server-side, in de proxy als in
// tests gebruikt kan worden. Een bevoegdheid is altijd "<onderdeel>:<actie>".
//
// Historische dossiers worden gearchiveerd, niet verwijderd. Alleen waar dat
// expliciet nodig is (contactmomenten) bestaat een aparte actie "delete" voor
// definitief wissen; die valt nooit onder een niveau en wordt los toegekend.

export type Action =
  | "read"
  | "create"
  | "update"
  | "archive"
  | "delete"
  | "download"
  | "send"
  | "approve"
  | "export"
  | "manage_settings"
  | "manage_rights";

export interface ActionInfo {
  label: string;
  hint: string;
  /** Risicovol: valt nooit onder het niveau "Lezen en bewerken". */
  advanced: boolean;
}

export const ACTIONS: Record<Action, ActionInfo> = {
  read: { label: "Bekijken", hint: "Gegevens inzien.", advanced: false },
  create: { label: "Aanmaken", hint: "Nieuwe items toevoegen.", advanced: false },
  update: { label: "Wijzigen", hint: "Bestaande items aanpassen.", advanced: false },
  archive: { label: "Archiveren", hint: "Items uit de actieve lijsten halen (blijft bewaard).", advanced: true },
  delete: { label: "Definitief wissen", hint: "Onherroepelijk verwijderen; kan niet ongedaan worden gemaakt.", advanced: true },
  download: { label: "Downloaden", hint: "Bestanden of documenten downloaden.", advanced: true },
  send: { label: "Versturen", hint: "Extern versturen (e-mail naar sponsoren).", advanced: true },
  approve: { label: "Goedkeuren / definitief maken", hint: "Een onomkeerbare of formele stap zetten.", advanced: true },
  export: { label: "Exporteren", hint: "Gegevens exporteren naar een bestand.", advanced: true },
  manage_settings: { label: "Instellingen beheren", hint: "Configuratie van dit onderdeel wijzigen.", advanced: true },
  manage_rights: { label: "Rechten beheren", hint: "Rechten van anderen aanpassen binnen de delegatiegrens.", advanced: true },
};

export type AreaKey =
  | "companies"
  | "contacts"
  | "history"
  | "opportunities"
  | "contracts"
  | "contract_documents"
  | "files"
  | "counterparts"
  | "tasks"
  | "amounts"
  | "invoices"
  | "credit_notes"
  | "payments"
  | "mailings"
  | "reports"
  | "exports"
  | "settings"
  | "rights";

export interface AreaInfo {
  label: string;
  description: string;
  group: "Relaties" | "Afspraken" | "Financiën" | "Communicatie" | "Beheer";
  actions: Action[];
  /** Bevat financiële gegevens: afzonderlijk zichtbaarheidsbeheer. */
  financial?: boolean;
  /** Vertrouwelijk (bv. contractdocumenten): nooit via algemene bestandsrechten bereikbaar. */
  confidential?: boolean;
}

export const AREAS: Record<AreaKey, AreaInfo> = {
  companies: { label: "Bedrijven en sponsordossiers", description: "Het centrale bedrijvenbestand.", group: "Relaties", actions: ["read", "create", "update", "archive"] },
  contacts: { label: "Contactpersonen", description: "Personen bij sponsoren en prospects.", group: "Relaties", actions: ["read", "create", "update", "archive"] },
  history: { label: "Contacthistorie en gespreksnotities", description: "Tijdlijn van contactmomenten.", group: "Relaties", actions: ["read", "create", "update", "archive", "delete"] },
  opportunities: { label: "Acquisitie en commerciële kansen", description: "Pijplijn van potentiële sponsoren.", group: "Relaties", actions: ["read", "create", "update", "archive", "approve"] },
  contracts: { label: "Contractgegevens", description: "Contracten zonder de bijbehorende documenten.", group: "Afspraken", actions: ["read", "create", "update", "archive", "approve"] },
  contract_documents: { label: "Contractdocumenten", description: "Ondertekende contracten, offertes en bijlagen.", group: "Afspraken", actions: ["read", "create", "update", "download", "archive"], confidential: true },
  files: { label: "Algemene bestanden en logo's", description: "Logo's, advertenties en uitvoeringsbewijzen.", group: "Afspraken", actions: ["read", "create", "update", "download", "archive"] },
  counterparts: { label: "Tegenprestaties", description: "Wat HHC aan sponsoren heeft toegezegd.", group: "Afspraken", actions: ["read", "create", "update", "archive"] },
  tasks: { label: "Taken", description: "Taken en afspraken, inclusief afronden.", group: "Afspraken", actions: ["read", "create", "update", "archive"] },
  amounts: { label: "Sponsorbedragen en inkomsten", description: "Bedragen per sponsor en seizoen; indexatie toepassen is 'goedkeuren'.", group: "Financiën", actions: ["read", "update", "approve"], financial: true },
  invoices: { label: "Facturen", description: "Concept tot verzonden factuur; definitief maken is 'goedkeuren'.", group: "Financiën", actions: ["read", "create", "update", "download", "send", "approve"], financial: true },
  credit_notes: { label: "Creditnota's", description: "Creditering van definitieve facturen.", group: "Financiën", actions: ["read", "create", "download", "send", "approve"], financial: true },
  payments: { label: "Betalingen", description: "Betalingen registreren en corrigeren.", group: "Financiën", actions: ["read", "create", "update"], financial: true },
  mailings: { label: "Mailings en verzendresultaten", description: "Voorbereiden en versturen naar sponsoren.", group: "Communicatie", actions: ["read", "create", "update", "send", "archive"] },
  reports: { label: "Rapportages", description: "Dashboards en overzichten (financiële cijfers volgen de financiële rechten).", group: "Communicatie", actions: ["read"] },
  exports: { label: "Gegevensexports", description: "Exporteren naar CSV of Excel.", group: "Communicatie", actions: ["export"] },
  settings: { label: "Commerciële instellingen", description: "Seizoenen, pakketten, statussen en templates.", group: "Beheer", actions: ["read", "manage_settings"] },
  rights: { label: "Gebruikers- en rechtenbeheer", description: "Wie mag wat binnen Commerciële Zaken.", group: "Beheer", actions: ["read", "manage_rights"] },
};

export type Permission = `${AreaKey}:${Action}`;

export const AREA_KEYS = Object.keys(AREAS) as AreaKey[];

export function perm(area: AreaKey, action: Action): Permission {
  return `${area}:${action}` as Permission;
}

export const ALL_PERMISSIONS: Permission[] = AREA_KEYS.flatMap((a) => AREAS[a].actions.map((act) => perm(a, act)));

const ALL_SET = new Set<string>(ALL_PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return ALL_SET.has(value);
}

export function splitPermission(p: Permission): { area: AreaKey; action: Action } {
  const [area, action] = p.split(":") as [AreaKey, Action];
  return { area, action };
}

/**
 * Vereiste bevoegdheden: een bevoegdheid werkt alleen als de bevoegdheden
 * hier genoemd ook zijn toegestaan. Zo ontstaat "wijzigen zonder lezen" niet.
 * Alles behalve "read" vereist de leesbevoegdheid van hetzelfde onderdeel.
 */
export function requiredPermissions(p: Permission): Permission[] {
  const { area, action } = splitPermission(p);
  if (action === "read" || area === "exports") return [];
  return [perm(area, "read")];
}

export type Level = "none" | "read" | "edit";

/** "Lezen en bewerken" = lezen + aanmaken + wijzigen; nooit de risicovolle acties. */
export function permissionsForLevel(area: AreaKey, level: Level): Permission[] {
  if (level === "none") return [];
  const actions = AREAS[area].actions;
  const wanted: Action[] = level === "read" ? ["read"] : ["read", "create", "update"];
  return wanted.filter((a) => actions.includes(a)).map((a) => perm(area, a));
}

/** Het niveau dat bij een set bevoegdheden hoort, plus welke aanvullende acties openstaan. */
export function levelFor(area: AreaKey, granted: ReadonlySet<Permission>): { level: Level; extras: Action[] } {
  const has = (a: Action) => granted.has(perm(area, a));
  const actions = AREAS[area].actions;
  let level: Level = "none";
  if (has("read")) {
    level = "read";
    const editActions = (["create", "update"] as Action[]).filter((a) => actions.includes(a));
    if (editActions.length > 0 && editActions.every(has)) level = "edit";
  }
  const base = new Set<Action>(level === "edit" ? ["read", "create", "update"] : level === "read" ? ["read"] : []);
  const extras = actions.filter((a) => has(a) && !base.has(a));
  return { level, extras };
}

export interface ConsistencyIssue {
  permission: Permission;
  missing: Permission;
  message: string;
}

/** Controleert een set op tegenstrijdige combinaties; geeft begrijpelijke meldingen terug. */
export function findInconsistencies(granted: Iterable<Permission>): ConsistencyIssue[] {
  const set = new Set(granted);
  const issues: ConsistencyIssue[] = [];
  for (const p of set) {
    for (const req of requiredPermissions(p)) {
      if (!set.has(req)) {
        const { area, action } = splitPermission(p);
        issues.push({
          permission: p,
          missing: req,
          message: `'${ACTIONS[action].label}' bij '${AREAS[area].label}' werkt alleen als ook '${ACTIONS.read.label}' is toegestaan.`,
        });
      }
    }
  }
  return issues;
}
