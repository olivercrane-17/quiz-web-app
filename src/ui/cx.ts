/** Joins class names, skipping the falsy ones. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    out = out === "" ? part : `${out} ${part}`;
  }
  return out;
}
