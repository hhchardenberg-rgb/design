import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireTickets } from "@/lib/tickets/authz.server";
import { BULK_TEMPLATE_HEADER } from "@/lib/tickets/bulk";

/** Leeg CSV-sjabloon voor bulkuitgifte (puntkomma's, zoals Excel in Nederland verwacht). */
export async function GET() {
  try {
    await requireTickets("tickets:bulk");
    const body = "﻿" + BULK_TEMPLATE_HEADER.join(";") + "\r\nJan;Jansen;jan@voorbeeld.nl;0612345678;Voorbeeld BV;Sponsor;\r\n";
    return new NextResponse(body, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hhc-tickets-bulk-sjabloon.csv"' },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
