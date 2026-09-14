/**
 * Berekent hoe een geüploade afbeelding binnen een door de designer
 * vastgelegd kader getekend moet worden, inclusief de pan/zoom die de
 * gebruiker zelf toepast (zie MASTERPROMPT sectie 11: "gebruiker kan
 * afbeelding verschuiven; in- en uitzoomen; crop wordt binnen het kader
 * toegepast"). Puur en omgevingsonafhankelijk zodat browser-preview
 * (Konva) en server-export exact hetzelfde tekenen.
 */
export interface ImageFieldValue {
  assetUrl?: string;
  /** Verschuiving t.o.v. gecentreerd, in pixels op templateresolutie. */
  panX?: number;
  panY?: number;
  /** Extra zoomfactor bovenop de automatische contain/cover-schaal (>=1). */
  scale?: number;
}

export interface Box {
  width: number;
  height: number;
}

export interface ImageDraw {
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
}

export function computeImageDraw(
  box: Box,
  natural: Box,
  fit: "contain" | "cover",
  value: ImageFieldValue
): ImageDraw {
  if (natural.width <= 0 || natural.height <= 0) {
    return { drawX: 0, drawY: 0, drawWidth: box.width, drawHeight: box.height };
  }

  const baseScale =
    fit === "cover"
      ? Math.max(box.width / natural.width, box.height / natural.height)
      : Math.min(box.width / natural.width, box.height / natural.height);

  const scale = baseScale * Math.max(0.2, value.scale ?? 1);
  const drawWidth = natural.width * scale;
  const drawHeight = natural.height * scale;

  const maxPanX = Math.max(0, (drawWidth - box.width) / 2);
  const maxPanY = Math.max(0, (drawHeight - box.height) / 2);
  const panX = clamp(value.panX ?? 0, -maxPanX, maxPanX);
  const panY = clamp(value.panY ?? 0, -maxPanY, maxPanY);

  return {
    drawX: (box.width - drawWidth) / 2 + panX,
    drawY: (box.height - drawHeight) / 2 + panY,
    drawWidth,
    drawHeight,
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
