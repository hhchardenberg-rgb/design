import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { TemplateSchemaJson } from "@/lib/validations/template";

export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
}

export interface SeedResult {
  adminEmail: string;
  matchDate: string;
}

/**
 * Basisdata zodat de applicatie direct bruikbaar is: een admin-account, een
 * voorbeeldteam/-wedstrijd en een kant-en-klare "Matchday"-template. Alles
 * gebeurt via upserts, dus dit is veilig om meerdere keren te draaien
 * (bijv. via prisma/seed.ts lokaal, of via /api/system/seed op Vercel) —
 * bestaande gebruikers/records worden nooit overschreven.
 */
export async function runSeed(prisma: PrismaClient, options: SeedOptions): Promise<SeedResult> {
  const { adminEmail, adminPassword } = options;

  // Inloggen met e-mailadres is niet meer hoofdlettergevoelig (zie
  // normalizeEmail in src/lib/utils.ts, toegepast bij elke nieuwe/gewijzigde
  // gebruiker) — dit normaliseert bestaande, mogelijk nog gemengde-hoofdletter
  // e-mailadressen eenmalig mee. Best-effort: bij een (zeer onwaarschijnlijke)
  // botsing tussen twee bestaande adressen die alleen in hoofdletters
  // verschillen, slaat dit de rest van de seed niet plat.
  try {
    await prisma.$executeRaw`UPDATE users SET email = LOWER(email) WHERE email <> LOWER(email)`;
  } catch (error) {
    console.error("Kon bestaande e-mailadressen niet normaliseren naar kleine letters:", error);
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "Beheerder HHC",
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "vrijwilliger@hhchardenberg.nl" },
    update: {},
    create: {
      name: "Vrijwilliger",
      email: "vrijwilliger@hhchardenberg.nl",
      passwordHash: await bcrypt.hash("wachtwoord123", 10),
      role: "USER",
    },
  });

  // Officiële huisstijlkleuren uit het HHC Hardenberg huisstijlhandboek
  // (PMS Orange 021 / PMS Black, RGB/hex-kolom). Het handboek stelt
  // expliciet dat oranje altijd vol/ongemengd wordt toegepast — geen
  // "secundaire" tinten dus. Bijgewerkt via een handmatige upsert (i.p.v.
  // createMany+skipDuplicates, dat op het niet-unieke "name"-veld bij elke
  // her-seed stilzwijgend een nieuwe dubbele rij aanmaakte in plaats van
  // niets te doen) zodat een eerder met verkeerde hexwaarden geseede — en
  // door die bug inmiddels gedupliceerde — omgeving bij het opnieuw draaien
  // van deze seed alsnog wordt opgeschoond, zonder andere, door een admin
  // zelf toegevoegde kleuren te raken.
  const officialBrandColors = [
    { name: "HHC Oranje", hex: "#FF6F00", group: "primair", sortOrder: 0 },
    { name: "HHC Zwart", hex: "#000000", group: "primair", sortOrder: 1 },
    { name: "HHC Wit", hex: "#FFFFFF", group: "primair", sortOrder: 2 },
  ];
  for (const color of officialBrandColors) {
    const duplicates = await prisma.brandColor.findMany({
      where: { name: color.name },
      orderBy: { id: "asc" },
    });
    const [keep, ...extras] = duplicates;
    if (extras.length > 0) {
      await prisma.brandColor.deleteMany({ where: { id: { in: extras.map((e) => e.id) } } });
    }
    if (keep) {
      await prisma.brandColor.update({
        where: { id: keep.id },
        data: { hex: color.hex, group: color.group, sortOrder: color.sortOrder },
      });
    } else {
      await prisma.brandColor.create({ data: color });
    }
  }

  // Deze twee tinten werden voorheen automatisch meegeseed, maar het
  // huisstijlhandboek staat oranje alleen vol/ongemengd toe — nooit als
  // tint. Ze stonden hier niet op verzoek van HHC, dus verwijderen we ze
  // weer (alleen exact deze twee namen; door een admin zelf toegevoegde
  // kleuren blijven onaangeroerd).
  await prisma.brandColor.deleteMany({ where: { name: { in: ["Oranje donker", "Oranje licht"] } } });

  const club = await prisma.club.upsert({
    where: { id: "own-club-hhc" },
    update: {},
    create: {
      id: "own-club-hhc",
      name: "HHC Hardenberg",
      shortName: "HHC",
      isOwnClub: true,
    },
  });

  const team1 = await prisma.team.upsert({
    where: { id: "team-hhc-1" },
    update: {},
    create: {
      id: "team-hhc-1",
      clubId: club.id,
      name: "HHC Hardenberg 1",
      shortName: "HHC 1",
      competition: "Derde Divisie",
      ageGroup: "Senioren",
    },
  });

  await prisma.team.upsert({
    where: { id: "team-hhc-vrouwen-1" },
    update: {},
    create: {
      id: "team-hhc-vrouwen-1",
      clubId: club.id,
      name: "HHC Vrouwen 1",
      shortName: "HHC Vrouwen 1",
      competition: "Hoofdklasse Vrouwen",
      ageGroup: "Vrouwen",
    },
  });

  await prisma.team.upsert({
    where: { id: "team-hhc-o23" },
    update: {},
    create: {
      id: "team-hhc-o23",
      clubId: club.id,
      name: "HHC Onder 23",
      shortName: "HHC O23",
      ageGroup: "O23",
    },
  });

  const players = [
    { firstName: "Ben", lastName: "Scholte", number: 9, position: "Aanvaller" },
    { firstName: "Daan", lastName: "Kremer", number: 1, position: "Keeper" },
    { firstName: "Mohamed", lastName: "El Makrini", number: 7, position: "Middenvelder" },
    { firstName: "Jan", lastName: "de Groot", number: 4, position: "Verdediger" },
  ];
  for (const p of players) {
    await prisma.player.upsert({
      where: { id: `player-${p.lastName.toLowerCase().replace(/\s+/g, "-")}` },
      update: {},
      create: { id: `player-${p.lastName.toLowerCase().replace(/\s+/g, "-")}`, teamId: team1.id, ...p },
    });
  }

  const opponents = [
    { id: "opp-katwijk", name: "Katwijk", shortName: "Katwijk", primaryColor: "#1560BD" },
    { id: "opp-quick-boys", name: "Quick Boys", shortName: "Quick Boys", primaryColor: "#FFD400" },
    { id: "opp-rijnvogels", name: "FC Rijnvogels", shortName: "Rijnvogels", primaryColor: "#00843D" },
    { id: "opp-jong-almere", name: "Jong Almere City FC", shortName: "Jong Almere City", primaryColor: "#00205B" },
  ];
  for (const o of opponents) {
    await prisma.opponent.upsert({ where: { id: o.id }, update: {}, create: o });
  }

  const match = await prisma.match.upsert({
    where: { id: "match-hhc-katwijk" },
    update: {},
    create: {
      id: "match-hhc-katwijk",
      teamId: team1.id,
      opponentId: "opp-katwijk",
      isHome: true,
      date: nextSaturday(15, 30),
      competition: "Derde Divisie",
      round: "Speelronde 7",
      location: "Sportpark de Boshoek",
      status: "SCHEDULED",
    },
  });

  // ---------------------------------------------------------------------
  // Voorbeeldtemplate "Matchday" zodat de applicatie direct bruikbaar is,
  // ook zonder dat er al een PSD is geïmporteerd door een designer.
  // ---------------------------------------------------------------------
  const matchdaySchema: TemplateSchemaJson = {
    width: 1080,
    height: 1350,
    backgroundColor: "#000000",
    layers: [
      { id: "bg", type: "background", x: 0, y: 0, width: 1080, height: 1350, src: "/templates/matchday/background.png" },
      {
        id: "competition",
        type: "text",
        field: "competition",
        x: 90,
        y: 120,
        width: 900,
        height: 60,
        fontFamily: "Inter",
        fontWeight: 700,
        fontStyle: "normal",
        fontSize: 32,
        minFontSize: 20,
        color: "#FF6F00",
        align: "center",
        uppercase: true,
        letterSpacing: 4,
        lineHeight: 1.1,
        maxLines: 1,
        allowTruncate: false,
      },
      {
        id: "opponent",
        type: "text",
        field: "opponent",
        x: 60,
        y: 560,
        width: 960,
        height: 220,
        fontFamily: "Inter",
        fontWeight: 800,
        fontStyle: "normal",
        fontSize: 96,
        minFontSize: 40,
        color: "#FFFFFF",
        align: "center",
        uppercase: true,
        letterSpacing: 0,
        lineHeight: 1.05,
        maxLines: 2,
        allowTruncate: false,
      },
      {
        id: "opponent_logo",
        type: "image",
        field: "opponent_logo",
        x: 440,
        y: 260,
        width: 200,
        height: 200,
        fit: "contain",
        shape: "rect",
        cornerRadius: 0,
      },
      {
        id: "date",
        type: "text",
        field: "date",
        x: 90,
        y: 830,
        width: 430,
        height: 60,
        fontFamily: "Inter",
        fontWeight: 600,
        fontStyle: "normal",
        fontSize: 36,
        minFontSize: 22,
        color: "#FFFFFF",
        align: "left",
        uppercase: false,
        letterSpacing: 0,
        lineHeight: 1.1,
        maxLines: 1,
        allowTruncate: false,
      },
      {
        id: "time",
        type: "text",
        field: "time",
        x: 560,
        y: 830,
        width: 430,
        height: 60,
        fontFamily: "Inter",
        fontWeight: 600,
        fontStyle: "normal",
        fontSize: 36,
        minFontSize: 22,
        color: "#FFFFFF",
        align: "right",
        uppercase: false,
        letterSpacing: 0,
        lineHeight: 1.1,
        maxLines: 1,
        allowTruncate: false,
      },
      {
        id: "location",
        type: "text",
        field: "location",
        x: 90,
        y: 900,
        width: 900,
        height: 50,
        fontFamily: "Inter",
        fontWeight: 400,
        fontStyle: "normal",
        fontSize: 26,
        minFontSize: 16,
        color: "#C9C5BC",
        align: "left",
        uppercase: false,
        letterSpacing: 0,
        lineHeight: 1.1,
        maxLines: 1,
        allowTruncate: true,
      },
      {
        id: "accent",
        type: "color",
        field: "accent_color",
        x: 0,
        y: 1300,
        width: 1080,
        height: 50,
        shape: "rect",
        cornerRadius: 0,
        defaultColor: "#FF6F00",
      },
    ],
  };

  const template = await prisma.template.upsert({
    where: { slug: "matchday" },
    update: {},
    create: {
      slug: "matchday",
      name: "Matchday",
      description: "Aankondiging voor een aankomende wedstrijd.",
      category: "Wedstrijd",
      status: "PUBLISHED",
      sortOrder: 0,
      createdById: admin.id,
    },
  });

  const existingVersion = await prisma.templateVersion.findFirst({
    where: { templateId: template.id },
  });

  const version =
    existingVersion ??
    (await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        versionNumber: 1,
        status: "PUBLISHED",
        width: matchdaySchema.width,
        height: matchdaySchema.height,
        schemaJson: matchdaySchema as unknown as object,
        publishedAt: new Date(),
        exportFormats: ["PNG", "JPG", "WEBP"],
        fields: {
          create: [
            { key: "competition", label: "Competitie", type: "SHORT_TEXT", required: true, defaultValue: "Derde Divisie", sortOrder: 0 },
            { key: "opponent", label: "Tegenstander", type: "SHORT_TEXT", required: true, placeholder: "Bijv. Katwijk", maxLength: 40, sortOrder: 1 },
            { key: "opponent_logo", label: "Logo tegenstander", type: "LOGO", required: false, imageFit: "contain", sortOrder: 2 },
            { key: "date", label: "Datum", type: "DATE", required: true, sortOrder: 3 },
            { key: "time", label: "Aanvangstijd", type: "TIME", required: true, defaultValue: "15:30", sortOrder: 4 },
            { key: "location", label: "Locatie", type: "SHORT_TEXT", required: false, defaultValue: "Sportpark de Boshoek", maxLength: 60, sortOrder: 5 },
            { key: "accent_color", label: "Accentkleur", type: "BRAND_COLOR", required: false, defaultValue: "#FF6F00", sortOrder: 6 },
          ],
        },
      },
    }));

  await prisma.template.update({
    where: { id: template.id },
    data: { activeVersionId: version.id },
  });

  // Kennisbank: alleen de titels die HHC zelf aandroeg, als startpunt — geen
  // verzonnen inhoud. Elk artikel wordt maar één keer aangemaakt (op titel);
  // eenmaal door een beheerder geschreven/bewerkt, laat een her-seed het met
  // rust.
  const knowledgeArticleTitles = [
    "Hoe plaats ik een artikel?",
    "Hoe maak ik een Instagram Story?",
    "Hoe werk ik tijdens een wedstrijddag?",
    "Hoe interview ik een speler?",
    "Hoe schrijf ik een wedstrijdverslag?",
    "Wat doe ik bij een rode kaart/incident?",
    "Hoe gaan we om met negatieve reacties?",
    "Wanneer publiceren we transfernieuws?",
    "Hoe communiceren we bij overlijden?",
    "Hoe communiceren we bij afgelasting?",
  ];
  for (let i = 0; i < knowledgeArticleTitles.length; i++) {
    const title = knowledgeArticleTitles[i];
    const existing = await prisma.knowledgeArticle.findFirst({ where: { title } });
    if (!existing) {
      await prisma.knowledgeArticle.create({ data: { title, sortOrder: i } });
    }
  }

  // Crisiscommunicatie: startvoorstellen op expliciet verzoek van HHC ("doe
  // voorstellen, we passen de inhoud later aan"). Dit zijn generieke,
  // rolgebaseerde richtlijnen (geen verzonnen namen/telefoonnummers) die een
  // beheerder nog moet controleren en aanvullen met de echte, actuele
  // contactgegevens van de club. Een her-seed overschrijft nooit een
  // protocol waarvan een beheerder al "wie bellen" of "wie mag
  // communiceren" heeft ingevuld/gewijzigd.
  const crisisProtocolDrafts = [
    {
      title: "Incident op tribune",
      description: "Een incident met toeschouwers op de tribune, zoals een opstootje, vechtpartij of iemand die onwel wordt.",
      whoToCall: "Bij gevaar voor leven: 112. Waarschuw daarna direct de wedstrijdsecretaris en de voorzitter.",
      whoMayCommunicate:
        "Alleen de voorzitter of de door het bestuur aangewezen woordvoerder. Geen uitspraken op social media vanuit Team Communicatie voordat het bestuur akkoord heeft gegeven.",
      steps:
        "1) Zorg voor veiligheid, bel 112 indien nodig. 2) Meld het incident bij de voorzitter/wedstrijdsecretaris. 3) Verzamel geen beeldmateriaal van het incident zelf voor publicatie. 4) Wacht op groen licht van het bestuur voordat er iets naar buiten gaat.",
    },
    {
      title: "Ernstige blessure",
      description: "Een speler of official raakt ernstig geblesseerd tijdens een training of wedstrijd.",
      whoToCall: "112 bij levensgevaar. Daarna de teammanager/trainer en de voorzitter informeren.",
      whoMayCommunicate:
        "Alleen met toestemming van de betrokkene (of familie) en in overleg met het bestuur. Nooit medische details delen.",
      steps:
        "1) Eerste hulp/112. 2) Familie van de speler informeren (via trainer/teammanager, niet via social media). 3) Wacht met publiceren tot de betrokkene/familie akkoord is. 4) Bij publicatie: alleen feitelijk en met toestemming.",
    },
    {
      title: "Overlijden",
      description: "Het overlijden van een lid, vrijwilliger, speler of iemand nauw verbonden aan de club.",
      whoToCall: "Voorzitter en secretaris direct informeren. Zij nemen contact op met de familie.",
      whoMayCommunicate: "Uitsluitend de voorzitter, en pas nadat de familie toestemming heeft gegeven voor publicatie.",
      steps:
        "1) Wacht tot de familie is geïnformeerd en akkoord is met communicatie. 2) Stem de tekst af met voorzitter en familie. 3) Plaats een sobere, respectvolle boodschap. 4) Geen speculatie over de doodsoorzaak.",
    },
    {
      title: "Politie-incident",
      description: "Politie is betrokken bij een gebeurtenis op of rond het complex (bv. aanhouding, onderzoek, aangifte).",
      whoToCall: "Voorzitter direct informeren; laat de politie het woord doen over het incident zelf.",
      whoMayCommunicate: "Alleen de voorzitter, na afstemming met de politie over wat wel/niet gedeeld mag worden.",
      steps: "1) Werk mee met de politie. 2) Geen eigen berichtgeving over het incident zonder afstemming. 3) Bij persvragen: doorverwijzen naar de voorzitter.",
    },
    {
      title: "Wedstrijd gestaakt",
      description: "Een wedstrijd wordt vroegtijdig gestaakt (bv. door wangedrag, weer, blessure, incident).",
      whoToCall: "Wedstrijdsecretaris en voorzitter informeren; zij nemen zo nodig contact op met de KNVB.",
      whoMayCommunicate: "Team Communicatie mag de feitelijke uitslag/status melden; duiding of oorzaak alleen na overleg met de voorzitter.",
      steps: "1) Feiten vaststellen bij de scheidsrechter/wedstrijdleiding. 2) Kort en feitelijk communiceren dat de wedstrijd is gestaakt. 3) Wacht met duiding tot er meer bekend is.",
    },
    {
      title: "Discriminatie",
      description: "Discriminerende uitingen (bv. spreekkoren, uitingen op social media) rond de club.",
      whoToCall: "Meld het direct bij de voorzitter en de vertrouwenscontactpersoon.",
      whoMayCommunicate:
        "Alleen de voorzitter, samen met de vertrouwenscontactpersoon. HHC Hardenberg hanteert een nultolerantiebeleid tegen discriminatie.",
      steps: "1) Leg het incident vast (wat, wanneer, door wie indien bekend). 2) Meld dit bij het bestuur en eventueel de KNVB. 3) Communiceer pas een vooraf afgestemde verklaring.",
    },
    {
      title: "Privacy-incident",
      description: "Persoonsgegevens zijn per ongeluk gedeeld of gelekt (bv. een verkeerde foto, ledenlijst of medische info).",
      whoToCall: "Meld dit direct bij de voorzitter/secretaris (verantwoordelijk voor AVG binnen de club).",
      whoMayCommunicate: "Alleen na overleg met het bestuur; betrokkenen moeten waar nodig persoonlijk geïnformeerd worden.",
      steps:
        "1) Verwijder de gepubliceerde gegevens zo snel mogelijk. 2) Informeer de betrokkene(n). 3) Meld dit intern bij het bestuur en beoordeel of een meldplicht datalekken van toepassing is.",
    },
    {
      title: "Foutieve publicatie",
      description: "Er is een bericht, foto of grafiek gepubliceerd met een fout (bv. verkeerde naam, uitslag of gevoelige informatie).",
      whoToCall: "Meld dit direct bij de coördinator communicatie.",
      whoMayCommunicate: "Team Communicatie mag zelf corrigeren of verwijderen; bij gevoelige fouten eerst afstemmen met het bestuur.",
      steps: "1) Pas het bericht direct aan of verwijder het. 2) Plaats bij verspreiding een correctie. 3) Bied excuses aan indien nodig.",
    },
  ];
  for (let i = 0; i < crisisProtocolDrafts.length; i++) {
    const { title, ...draft } = crisisProtocolDrafts[i];
    const existing = await prisma.crisisProtocol.findFirst({ where: { title } });
    if (!existing) {
      await prisma.crisisProtocol.create({ data: { title, sortOrder: i, ...draft } });
    } else if (!existing.whoToCall && !existing.whoMayCommunicate && !existing.description && !existing.steps) {
      // Nog volledig leeg (zoals bij het aanmaken) — vul het voorstel aan
      // zonder eerdere aanpassingen door een beheerder te overschrijven.
      await prisma.crisisProtocol.update({ where: { id: existing.id }, data: draft });
    }
  }

  return { adminEmail, matchDate: match.date.toISOString() };
}

function nextSaturday(hour: number, minute: number): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(hour, minute, 0, 0);
  return d;
}
