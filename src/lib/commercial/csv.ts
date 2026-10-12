// Kleine, afhankelijkheidsvrije CSV-lezer (RFC 4180-stijl) voor de import. Draait in de browser en in tests.

/** Detecteert ; of , als scheidingsteken (Excel in NL gebruikt meestal ;). */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const head = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => head.split(c).length - 1;
  const best = ([";", ",", "\t"] as const).reduce((a, b) => (count(b) > count(a) ? b : a));
  return best;
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === d) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Voor toekomstige exports: voorkomt dat spreadsheetprogramma's een cel als formule uitvoeren. */
export function csvSafeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
