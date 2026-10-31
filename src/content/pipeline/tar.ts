/**
 * A minimal reader for (gzipped) tar archives, enough for npm tarballs.
 * Members are returned as bytes and never extracted by name onto disk, so a
 * hostile archive cannot write outside the folder the caller chooses.
 */
import { gunzipSync } from "node:zlib";

export interface TarMember {
  name: string;
  type: "file" | "directory" | "other";
  data: Buffer;
}

function cString(block: Buffer, start: number, length: number): string {
  const slice = block.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8");
}

function octal(block: Buffer, start: number, length: number): number {
  const raw = cString(block, start, length).trim();
  return raw === "" ? 0 : Number.parseInt(raw, 8);
}

/** pax extended header records: "<len> key=value\n". */
function paxPath(data: Buffer): string | undefined {
  const text = data.toString("utf8");
  for (const line of text.split("\n")) {
    const match = /^\d+ path=(.*)$/.exec(line);
    if (match) return match[1];
  }
  return undefined;
}

export function readTar(archive: Buffer): TarMember[] {
  const buffer =
    archive[0] === 0x1f && archive[1] === 0x8b ? gunzipSync(archive) : archive;
  const members: TarMember[] = [];
  let offset = 0;
  let longName: string | undefined;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = octal(header, 124, 12);
    if (!Number.isFinite(size) || size < 0)
      throw new Error("corrupt tar header");
    const flag = String.fromCharCode(header[156] ?? 0);
    const prefix = cString(header, 257, 6).startsWith("ustar")
      ? cString(header, 345, 155)
      : "";
    const base = cString(header, 0, 100);
    const name = longName ?? (prefix ? `${prefix}/${base}` : base);
    const data = buffer.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (flag === "x") {
      longName = paxPath(data);
      continue;
    }
    if (flag === "L") {
      longName = cString(data, 0, data.length);
      continue;
    }
    longName = undefined;
    if (flag === "g") continue;
    const type =
      flag === "0" || flag === "\0" || flag === ""
        ? "file"
        : flag === "5"
          ? "directory"
          : "other";
    members.push({ name, type, data: Buffer.from(data) });
  }
  return members;
}
