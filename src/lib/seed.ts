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

  // Crisiscommunicatie: idem — alleen de incidenttypes die HHC aandroeg.
  // "Wie bellen"/"wie mag communiceren" blijft bewust leeg: dat is
  // veiligheidskritische, club-specifieke info die alleen een beheerder kan
  // invullen, nooit iets om te verzinnen.
  const crisisProtocolTitles = [
    "Incident op tribune",
    "Ernstige blessure",
    "Overlijden",
    "Politie-incident",
    "Wedstrijd gestaakt",
    "Discriminatie",
    "Privacy-incident",
    "Foutieve publicatie",
  ];
  for (let i = 0; i < crisisProtocolTitles.length; i++) {
    const title = crisisProtocolTitles[i];
    const existing = await prisma.crisisProtocol.findFirst({ where: { title } });
    if (!existing) {
      await prisma.crisisProtocol.create({ data: { title, sortOrder: i } });
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
