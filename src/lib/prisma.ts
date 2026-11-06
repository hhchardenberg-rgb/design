import { PrismaClient } from "@prisma/client";
import { decryptField, encryptField } from "@/lib/data-crypto";

/**
 * Velden met persoonsgegevens die versleuteld in de database staan (zie src/lib/data-crypto.ts).
 * Schrijven versleutelt (in productie), lezen ontsleutelt, ook bij include/select via een relatie.
 * Op deze velden wordt nergens gezocht of gesorteerd; dat kan met versleutelde waarden ook niet.
 */
export const ENCRYPTED_FIELDS = {
  user: ["phone"],
  commercialContact: ["phone", "notes"],
  commercialCompany: ["internalNotes"],
} as const;

type Model = keyof typeof ENCRYPTED_FIELDS;
const WRITE_OPS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert"]);

function encryptData(model: Model, data: unknown): unknown {
  if (Array.isArray(data)) return data.map((d) => encryptData(model, d));
  if (!data || typeof data !== "object") return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const field of ENCRYPTED_FIELDS[model]) {
    const v = out[field];
    if (typeof v === "string") out[field] = encryptField(v);
    else if (v && typeof v === "object" && "set" in v && typeof (v as { set: unknown }).set === "string") {
      out[field] = { set: encryptField((v as { set: string }).set) };
    }
  }
  return out;
}

function encryptArgs(model: Model, operation: string, args: Record<string, unknown>) {
  if (!WRITE_OPS.has(operation) || !args) return args;
  if (operation === "upsert") return { ...args, create: encryptData(model, args.create), update: encryptData(model, args.update) };
  return { ...args, data: encryptData(model, args.data) };
}


function createClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  const extended = base.$extends({
    query: {
      user: { $allOperations: ({ operation, args, query }) => query(encryptArgs("user", operation, args as Record<string, unknown>) as never) },
      commercialContact: {
        $allOperations: ({ operation, args, query }) => query(encryptArgs("commercialContact", operation, args as Record<string, unknown>) as never),
      },
      commercialCompany: {
        $allOperations: ({ operation, args, query }) => query(encryptArgs("commercialCompany", operation, args as Record<string, unknown>) as never),
      },
    },
    result: {
      user: { phone: { needs: { phone: true }, compute: (u) => decryptField(u.phone) } },
      commercialContact: {
        phone: { needs: { phone: true }, compute: (c) => decryptField(c.phone) },
        notes: { needs: { notes: true }, compute: (c) => decryptField(c.notes) },
      },
      commercialCompany: { internalNotes: { needs: { internalNotes: true }, compute: (c) => decryptField(c.internalNotes) } },
    },
  });
  // Zelfde type als een gewone PrismaClient: de extensie verandert geen veldtypes, alleen de inhoud.
  return extended as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
