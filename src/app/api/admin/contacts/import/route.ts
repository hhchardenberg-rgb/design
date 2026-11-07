import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHubAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { normalizeName, parseContactList } from "@/lib/contacts-import";

/**
 * Plak-import voor Beheer → Contactpersonen.
 * `dryRun: true` geeft alleen een voorbeeld terug; anders worden de nieuwe personen toegevoegd.
 * Namen die al bestaan (hoofdletters/accenten genegeerd) worden overgeslagen en nooit gewijzigd.
 */
export async function POST(req: Request) {
  try {
    await requireHubAdmin();
    const body = (await req.json().catch(() => null)) as { text?: unknown; dryRun?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim()) throw new ApiError(400, "Plak eerst een lijst.");
    if (text.length > 20000) throw new ApiError(400, "De lijst is te lang. Plak maximaal een paar honderd regels tegelijk.");

    const { rows, errors } = parseContactList(text);
    const existing = await prisma.contact.findMany({ select: { name: true, sortOrder: true } });
    const known = new Set(existing.map((c) => normalizeName(c.name)));

    const preview = rows.map((row) => {
      const key = normalizeName(row.name);
      const status = known.has(key) ? ("bestaat" as const) : ("nieuw" as const);
      known.add(key); // dubbel binnen de geplakte lijst zelf
      return { ...row, status };
    });

    const toCreate = preview.filter((r) => r.status === "nieuw");
    if (body?.dryRun === true) {
      return NextResponse.json({ preview, errors });
    }

    let sortOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), 0);
    await prisma.$transaction(
      toCreate.map((r) =>
        prisma.contact.create({
          data: { name: r.name, role: r.role, phone: r.phone, email: r.email, sortOrder: ++sortOrder },
        })
      )
    );

    return NextResponse.json({ preview, errors, created: toCreate.length, skipped: preview.length - toCreate.length });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
