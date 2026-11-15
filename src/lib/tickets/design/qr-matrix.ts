// QR-code als modulematrix, zodat de mobiele pagina (svg) en de pdf (vectorvlakken) de code scherp
// en onvervormd tekenen. De inhoud komt altijd van het ticketsysteem (token.ts); hier wordt alleen getekend.
import QRCode from "qrcode";

export interface QrMatrix {
  size: number;
  /** Donkere modules als horizontale stroken [x, y, lengte]. */
  runs: [number, number, number][];
}

export function qrMatrix(code: string): QrMatrix {
  const q = QRCode.create(code, { errorCorrectionLevel: "M" });
  const size = q.modules.size;
  const data = q.modules.data;
  const runs: [number, number, number][] = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (data[y * size + x]) {
        const start = x;
        while (x < size && data[y * size + x]) x++;
        runs.push([start, y, x - start]);
      } else x++;
    }
  }
  return { size, runs };
}

/** SVG-pad (viewBox 0 0 size size) van de donkere modules. */
export function qrPath(m: QrMatrix): string {
  return m.runs.map(([x, y, w]) => `M${x} ${y}h${w}v1h-${w}z`).join("");
}
