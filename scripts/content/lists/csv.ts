/**
 * A small RFC 4180 reader for the CSV datasets (world-cities, Tate):
 * quoted fields, doubled quotes inside them, commas and line breaks inside
 * quotes, CRLF or LF rows. Datasets are data: this only splits text.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text.charAt(i + 1) === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Rows as objects keyed by the header row. */
export function csvObjects(text: string): Record<string, string>[] {
  const [header = [], ...rows] = parseCsv(text.replace(/^﻿/, ""));
  return rows
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) =>
      Object.fromEntries(header.map((name, i) => [name, row[i] ?? ""])),
    );
}
