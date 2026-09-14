import { PrismaClient } from "@prisma/client";
import { runSeed } from "../src/lib/seed";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "beheer@hhchardenberg.nl";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "wijzig-dit-wachtwoord";

  const result = await runSeed(prisma, { adminEmail, adminPassword });

  console.log("Seed voltooid.");
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
  console.log(`Voorbeeldwedstrijd: HHC Hardenberg - Katwijk (${result.matchDate})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
