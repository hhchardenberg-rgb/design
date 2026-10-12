import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, type RecordCtx } from "./ctx.server";

export async function listTeams(ctx: RecordCtx) {
  need(ctx, "settings:read");
  const [teams, members] = await Promise.all([
    prisma.commercialTeam.findMany({ orderBy: { name: "asc" }, include: { members: true } }),
    prisma.commercialMembership.findMany({ include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    teams: teams.map((t) => ({ id: t.id, name: t.name, memberIds: t.members.map((m) => m.userId) })),
    candidates: members.map((m) => ({ id: m.user.id, name: m.user.name })),
  };
}

export async function createTeam(ctx: RecordCtx, name: string) {
  need(ctx, "settings:manage_settings");
  const clean = name.trim();
  if (!clean) throw new ApiError(400, "Geef het team een naam.");
  if (await prisma.commercialTeam.findUnique({ where: { name: clean } })) throw new ApiError(409, "Er bestaat al een team met deze naam.");
  const team = await prisma.commercialTeam.create({ data: { name: clean } });
  await auditRecord(ctx, { action: "team.create", entity: "team", entityId: team.id });
  return team;
}

/**
 * Teamlidmaatschap bepaalt het bereik 'eigen team' en is dus een rechtenwijziging:
 * vereist naast teaminstellingen ook rechtenbeheer, en je kunt je eigen
 * lidmaatschap niet wijzigen.
 */
export async function setTeamMembers(ctx: RecordCtx, teamId: string, userIds: string[]) {
  need(ctx, "settings:manage_settings");
  need(ctx, "rights:manage_rights");
  const team = await prisma.commercialTeam.findUnique({ where: { id: teamId }, include: { members: true } });
  if (!team) throw new ApiError(404, "Team niet gevonden.");
  const before = team.members.map((m) => m.userId).sort();
  const after = [...new Set(userIds)].sort();
  const changed = [...before.filter((u) => !after.includes(u)), ...after.filter((u) => !before.includes(u))];
  if (changed.includes(ctx.userId)) throw new ApiError(403, "Je kunt je eigen teamlidmaatschap niet wijzigen. Vraag een andere beheerder.");
  const valid = await prisma.commercialMembership.findMany({ where: { userId: { in: after } }, select: { userId: true } });
  if (valid.length !== after.length) throw new ApiError(400, "Alleen mensen met toegang tot Commerciële Zaken kunnen in een team.");
  await prisma.$transaction([
    prisma.commercialTeamMember.deleteMany({ where: { teamId } }),
    prisma.commercialTeamMember.createMany({ data: after.map((userId) => ({ teamId, userId })) }),
  ]);
  await auditRecord(ctx, { action: "team.members", entity: "team", entityId: teamId, before: { userIds: before }, after: { userIds: after } });
}
