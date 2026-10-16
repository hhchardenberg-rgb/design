import { prisma } from "@/lib/prisma";
import type { TemplateSchemaJson } from "@/lib/validations/template";
import { FormDataError, type ImageAssetRef, type ImageValue, type ValidationField } from "./form-data";

/**
 * Autorisatie van afbeeldingen in een ontwerp.
 *
 * Een URL of id uit een request is op zichzelf geen toestemming. Elke
 * afbeelding in formData moet herleidbaar zijn tot een bestand dat de
 * eigenaar van het ontwerp mag gebruiken:
 *  - een eigen upload (UploadedAsset van de ontwerp-eigenaar);
 *  - gedeelde clubmedia: logo van club, team of tegenstander, spelersfoto,
 *    of een foto uit de fotobank;
 *  - een placeholder die in de templateversie zelf staat.
 *
 * De URL die uiteindelijk bewaard en gerenderd wordt, komt altijd uit het
 * databaserecord, nooit uit de request. Oudere ontwerpen bevatten alleen een
 * `assetUrl`; die wordt opgezocht in dezelfde bronnen en alleen geaccepteerd
 * als er een passend record is.
 */

interface ResolvedAsset {
  ref: ImageAssetRef | null;
  url: string;
}

export async function resolveDesignImages(
  fields: ValidationField[],
  formData: Record<string, unknown>,
  ctx: { ownerId: string; schema: TemplateSchemaJson }
): Promise<Record<string, unknown>> {
  const out = { ...formData };
  const templateSrcs = templateImageSources(ctx.schema);

  for (const field of fields) {
    if (field.type !== "IMAGE" && field.type !== "LOGO") continue;
    const value = out[field.key] as ImageValue | undefined;
    if (!value || (!value.asset && !value.assetUrl)) continue;

    const resolved = value.asset
      ? await resolveRef(value.asset, ctx.ownerId)
      : await resolveLegacyUrl(value.assetUrl!, ctx.ownerId, templateSrcs);
    if (!resolved) {
      throw new FormDataError(`${field.label}: deze afbeelding is niet (meer) beschikbaar of je mag hem niet gebruiken.`, field.key);
    }
    const next: ImageValue = { ...value, assetUrl: resolved.url };
    if (resolved.ref) next.asset = resolved.ref;
    else delete next.asset;
    out[field.key] = next;
  }
  return out;
}

async function resolveRef(ref: ImageAssetRef, ownerId: string): Promise<ResolvedAsset | null> {
  const url = await urlForRef(ref, ownerId);
  return url ? { ref, url } : null;
}

async function urlForRef(ref: ImageAssetRef, ownerId: string): Promise<string | null> {
  switch (ref.kind) {
    case "upload": {
      const a = await prisma.uploadedAsset.findUnique({ where: { id: ref.id } });
      return a && a.userId === ownerId ? a.url : null;
    }
    case "opponent":
      return (await prisma.opponent.findUnique({ where: { id: ref.id } }))?.logoUrl ?? null;
    case "team":
      return (await prisma.team.findUnique({ where: { id: ref.id } }))?.logoUrl ?? null;
    case "club":
      return (await prisma.club.findUnique({ where: { id: ref.id } }))?.logoUrl ?? null;
    case "player":
      return (await prisma.player.findUnique({ where: { id: ref.id } }))?.photoUrl ?? null;
    case "stock":
      return (await prisma.stockPhoto.findUnique({ where: { id: ref.id } }))?.url ?? null;
  }
}

async function resolveLegacyUrl(url: string, ownerId: string, templateSrcs: Set<string>): Promise<ResolvedAsset | null> {
  if (templateSrcs.has(url)) return { ref: null, url };

  const upload = await prisma.uploadedAsset.findFirst({ where: { url, userId: ownerId }, select: { id: true } });
  if (upload) return { ref: { kind: "upload", id: upload.id }, url };

  const [opponent, team, club, player, stock] = await Promise.all([
    prisma.opponent.findFirst({ where: { logoUrl: url }, select: { id: true } }),
    prisma.team.findFirst({ where: { logoUrl: url }, select: { id: true } }),
    prisma.club.findFirst({ where: { logoUrl: url }, select: { id: true } }),
    prisma.player.findFirst({ where: { photoUrl: url }, select: { id: true } }),
    prisma.stockPhoto.findFirst({ where: { url }, select: { id: true } }),
  ]);
  if (opponent) return { ref: { kind: "opponent", id: opponent.id }, url };
  if (team) return { ref: { kind: "team", id: team.id }, url };
  if (club) return { ref: { kind: "club", id: club.id }, url };
  if (player) return { ref: { kind: "player", id: player.id }, url };
  if (stock) return { ref: { kind: "stock", id: stock.id }, url };
  return null;
}

/** Alle afbeeldingsbronnen die de templateversie zelf meebrengt. */
export function templateImageSources(schema: TemplateSchemaJson): Set<string> {
  const srcs = new Set<string>();
  for (const layer of schema.layers) {
    if ((layer.type === "background" || layer.type === "static_image") && layer.src) srcs.add(layer.src);
    if (layer.type === "image" && layer.placeholderSrc) srcs.add(layer.placeholderSrc);
  }
  return srcs;
}
