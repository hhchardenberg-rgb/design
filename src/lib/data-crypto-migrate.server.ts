import { prisma } from "@/lib/prisma";
import { encryptionActive } from "@/lib/data-crypto";

/**
 * Versleutelt bestaande gevoelige velden die nog in platte tekst staan (zie ENCRYPTED_FIELDS in
 * src/lib/prisma.ts). Idempotent; draait nachtelijks, alleen waar versleuteld schrijven mag.
 * Het schrijven zelf gaat via de Prisma-extensie, die de waarde versleutelt.
 */
export async function encryptExistingFields(): Promise<number> {
  if (!encryptionActive()) return 0;
  let n = 0;
  const plain = (field: string) => ({ [field]: { not: null }, NOT: { [field]: { startsWith: "enc1:" } } });

  for (const u of await prisma.user.findMany({ where: plain("phone"), select: { id: true, phone: true } })) {
    await prisma.user.update({ where: { id: u.id }, data: { phone: u.phone } });
    n++;
  }
  for (const field of ["phone", "notes"] as const) {
    for (const c of await prisma.commercialContact.findMany({ where: plain(field), select: { id: true, [field]: true } as { id: true; phone: true; notes: true } })) {
      await prisma.commercialContact.update({ where: { id: c.id }, data: { [field]: c[field] } });
      n++;
    }
  }
  for (const c of await prisma.commercialCompany.findMany({ where: plain("internalNotes"), select: { id: true, internalNotes: true } })) {
    await prisma.commercialCompany.update({ where: { id: c.id }, data: { internalNotes: c.internalNotes } });
    n++;
  }
  for (const t of await prisma.ticket.findMany({ where: plain("phone"), select: { id: true, phone: true } })) {
    await prisma.ticket.update({ where: { id: t.id }, data: { phone: t.phone } });
    n++;
  }
  return n;
}
