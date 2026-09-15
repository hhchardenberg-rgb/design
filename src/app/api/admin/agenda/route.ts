import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { getMergedAgendaEvents } from "@/lib/agenda";

export async function GET() {
  try {
    await requireAdmin();
    // Toont het samengevoegde overzicht (live ICS-feed + handmatige/uitgelichte
    // agendapunten) — precies dezelfde data als /kalender, zodat een beheerder
    // in één lijst kan uitlichten, toelichten en handmatige items beheren.
    const { events, icsError } = await getMergedAgendaEvents({
      from: new Date(new Date().setHours(0, 0, 0, 0)),
      limit: 150,
    });
    return NextResponse.json({ events, icsError });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();

    if (body.source === "ICS") {
      // Een event uit de live feed uitlichten: sla alleen een koppelrecord op
      // (icsUid + eventuele "meer uitleg"), de tijd/titel/locatie blijven
      // altijd van de live feed komen.
      if (!body.icsUid) throw new ApiError(400, "icsUid is verplicht om een agendapunt uit te lichten.");
      const agendaEvent = await prisma.agendaEvent.upsert({
        where: { icsUid: body.icsUid },
        update: { highlighted: body.highlighted ?? true, description: body.description ?? null },
        create: {
          source: "ICS",
          icsUid: body.icsUid,
          title: body.title ?? "",
          description: body.description ?? null,
          location: body.location ?? null,
          start: new Date(body.start),
          end: body.end ? new Date(body.end) : null,
          isFullDay: body.isFullDay ?? false,
          highlighted: body.highlighted ?? true,
        },
      });
      return NextResponse.json({ agendaEvent });
    }

    if (!body.title || !body.start) throw new ApiError(400, "Titel en startdatum zijn verplicht.");
    const agendaEvent = await prisma.agendaEvent.create({
      data: {
        source: "MANUAL",
        title: body.title,
        description: body.description || null,
        location: body.location || null,
        start: new Date(body.start),
        end: body.end ? new Date(body.end) : null,
        isFullDay: body.isFullDay ?? false,
        highlighted: body.highlighted ?? false,
      },
    });
    return NextResponse.json({ agendaEvent });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
