import type { PrismaClient } from "@prisma/client";
import { effectiveRoles } from "@/lib/roles";

/**
 * Eenmalige, idempotente backfill: vult `roles` voor elke gebruiker die nog
 * op het legacy `role`-veld draait (roles is dan `[]`). Veilig om vaak te
 * draaien — gebruikers met al een expliciete `roles`-set worden overgeslagen.
 * Wordt aangeroepen vanuit runSeed() (/api/system/seed) en vanuit
 * GET /api/admin/users, zodat het gebruikersbeheerscherm altijd een
 * gemigreerde rollenset laat zien zonder een aparte migratiestap.
 */
export async function backfillUserRoles(prisma: PrismaClient): Promise<number> {
  const users = await prisma.user.findMany({
    where: { roles: { equals: [] } },
    select: { id: true, role: true, roles: true },
  });
  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: { roles: effectiveRoles(user) },
    });
  }
  return users.length;
}
