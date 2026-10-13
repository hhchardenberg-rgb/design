import { listContracts } from "./contracts.server";
import { listInvoices } from "./invoicing.server";
import { listOpportunities } from "./opportunities.server";
import { listTasks } from "./tasks.server";
import { planCounterparts } from "./contracts.server";
import { listContactGaps } from "./contact-moments.server";
import type { RecordCtx } from "./ctx.server";

/**
 * Overzicht voor de startpagina. Elk blok gebruikt dezelfde diensten als de eigen schermen en
 * verschijnt dus alleen met de juiste bevoegdheid, binnen het bereik en met bedragen alleen bij leesrecht.
 */
export async function loadDashboard(ctx: RecordCtx) {
  const tasks = ctx.can("tasks:read")
    ? await listTasks(ctx, { mine: true, status: "OPEN", pageSize: 5 }).then((r) => ({ total: r.total, rows: r.rows.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, companyName: t.companyName })) }))
    : null;
  const overdueTasks = ctx.can("tasks:read") ? (await listTasks(ctx, { mine: true, overdue: true, pageSize: 1 })).total : null;

  const contracts = ctx.can("contracts:read")
    ? await listContracts(ctx, { expiringWithinDays: 90, pageSize: 5 }).then((r) => ({ total: r.total, rows: r.rows.map((c) => ({ id: c.id, companyId: c.companyId, companyName: c.companyName, seasonName: c.seasonName, endsOn: c.endsOn, noticeUntil: c.noticeUntil })) }))
    : null;

  let invoices: { count: number; outstandingCents: number | null } | null = null;
  if (ctx.can("invoices:read")) {
    const issued = (await listInvoices(ctx, { kind: "INVOICE", status: "ISSUED" })).filter((i) => (i.outstandingCents ?? 1) > 0);
    invoices = {
      count: issued.length,
      outstandingCents: ctx.can("payments:read") ? issued.reduce((a, i) => a + (i.outstandingCents ?? 0), 0) : null,
    };
  }

  const pipeline = ctx.can("opportunities:read")
    ? await listOpportunities(ctx, {}).then((r) => ({ count: r.items.length, expectedCents: r.totalExpectedCents }))
    : null;

  const counterparts = ctx.can("counterparts:read") && ctx.can("contracts:read")
    ? await planCounterparts(ctx, { status: "OPEN" }).then((r) => ({ open: r.rows.length, overdue: r.rows.filter((x) => x.overdue).length }))
    : null;

  const contactGaps = ctx.can("companies:read") && ctx.can("history:read")
    ? await listContactGaps(ctx, { mine: true, pageSize: 5 }).then((r) => ({ total: r.total, rows: r.rows.map((g) => ({ companyId: g.companyId, companyName: g.companyName, daysSince: g.daysSince, lastContactOn: g.lastContactOn })) }))
    : null;

  return { tasks, overdueTasks, contracts, invoices, pipeline, counterparts, contactGaps };
}
