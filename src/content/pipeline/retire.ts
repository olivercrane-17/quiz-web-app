/**
 * Retiring an active item (CNT-2b): `content:batch -- retire`.
 *
 * `retired` is the status CONTENT_GUIDE §2.3 already defines for an item
 * that was in play and no longer is: one that shares a fact with a Daily
 * item (X29, AC-CNT-06, §10.5), failed a later re-check (§9.10), or gave
 * way to a new id after a changed key (§2.12). Only an active item retires;
 * content:decide handles draft and checking items (cut, or rewrite), and a
 * cut or retired item stays as it is. The item keeps its id, checks and
 * history, and gains a `retired` record (`at`, `by`, `kind`, `reason`). Ids
 * are never reused: they are issued from the register's lastSequence,
 * which only grows.
 *
 * From then on it leaves every pool count, content:build's packs and
 * outputs, the release's playable rows (the release loads it as retired so
 * the database marks it so) and X19's counts, and X29 ignores it: all of
 * them read active items, or items in play, only.
 *
 * The register follows: a closed batch stays closed and is recounted from
 * its items, as content:batch -- close counts them, so `accepted` drops
 * and `retired` rises. A batch not yet closed is counted when it closes.
 *
 * The schedule guard (schedule-locks.ts): an item that a main-track Daily
 * still to close, a spare set or a challenge pack names is refused unless
 * `allowFrozen`, as content:release treats frozen Dailies, and the
 * scheduler then replaces it there.
 *
 * Sealed items are read from and written to the plaintext workspace
 * (content:unseal first, content:seal after). A practice item's file is
 * public, so its retirement may not be of kind `cross_pool` and its reason
 * may not name a sealed item, a sealed batch, a list request, a Daily or
 * the sealed pools (ARCHITECTURE §5.4). Messages name ids, statuses
 * and counts only: never item text, and never the reason.
 */
import { BatchRegisterSchema, type BatchEntry } from "../schema/batches.ts";
import {
  EncoreSchema,
  MysterySchema,
  PracticeItemSchema,
  RETIRE_KINDS,
  RoomQuestionSchema,
  type AnyItem,
  type RetireKind,
  type RetiredRecord,
} from "../schema/items.ts";
import { agentId } from "../schema/primitives.ts";
import { formatPath, type Bank, type BankItem } from "./bank.ts";
import { batchForItem, parseItemId, type Pool } from "./ids.ts";
import { writeJsonFile } from "./json.ts";
import { batchItems } from "./register.ts";
import { editorRefusal } from "./roles.ts";
import {
  isLocked,
  scheduleLocks,
  type ScheduleLocks,
} from "./schedule-locks.ts";
import { editableCopy, saveItems, type SaveOptions } from "./store.ts";

export { RETIRE_KINDS, type RetireKind };

const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;

/**
 * Anything sealed a public file must never name: a mystery, encore or room
 * question id, a batch of those pools, a list request or a spare set (with
 * or without the fixtures' `fx.` prefix); a Daily by its number or its
 * date, in ISO form or in prose ("1 December 2026", "Dec 1", "01/12/2026"),
 * which would tie the public item to one day's answers; and the sealed
 * side itself by name (Daily, mystery, encore, sealed), since a public
 * record saying a Daily item shares this item's fact is close to that
 * Daily's answer.
 */
const SEALED_REFERENCES: readonly RegExp[] = [
  new RegExp(
    [
      String.raw`\b(?:fx\.)?(?:`,
      String.raw`m\.[a-z]+\.(?:\d{4}|b\d{2})`,
      String.raw`|e\.(?:\d{4}|b\d{2})`,
      String.raw`|r\.[a-z0-9]+(?:-[a-z0-9]+)*\.(?:\d{2}|b\d{2})`,
      String.raw`|lr\.[a-z0-9.-]+`,
      String.raw`|spare\.\d{2}`,
      String.raw`)\b`,
    ].join(""),
  ),
  /\bdaily\s*(?:#|no\.?|number)?\s*\d+/i,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{4}[/.]\d{1,2}[/.]\d{1,2}\b/,
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/,
  new RegExp(
    String.raw`\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH}(?![a-z])`,
    "i",
  ),
  new RegExp(String.raw`\b${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?\b`, "i"),
  /\b(?:daily|dailies|mystery|mysteries|encores?|sealed)\b/i,
];

/** True when `text` names something sealed (see SEALED_REFERENCES). */
export function namesSealedContent(text: string): boolean {
  return SEALED_REFERENCES.some((pattern) => pattern.test(text));
}

export interface RetireRequest {
  itemId: string;
  editor: string;
  reason: string;
  kind: RetireKind;
  /** ISO timestamp the record stores. */
  at: string;
  /** The UTC date the schedule guard reads. */
  today: string;
  /** Retire an item the schedule still holds, for a correction. */
  allowFrozen: boolean;
}

export interface RegisterCounts {
  accepted: number | null;
  cut: number | null;
  retired: number;
}

export interface RetirePlan {
  itemId: string;
  pool: Pool;
  sealed: boolean;
  /** The retired item, ready for saveItems. */
  item: AnyItem;
  /** The item's batch, when the register covers it. */
  batchId: string | null;
  batchStatus: BatchEntry["status"] | null;
  /** A closed batch's counts before and after; null while it is not closed. */
  register: { before: RegisterCounts; after: RegisterCounts } | null;
  /** Where the schedule holds the item (all zero for a practice item). */
  locks: ScheduleLocks;
}

const SCHEMAS = {
  practice: PracticeItemSchema,
  mystery: MysterySchema,
  encore: EncoreSchema,
  room: RoomQuestionSchema,
} as const;

function refuse(message: string): never {
  throw new Error(message);
}

/** The item with `retired` set right after `status`, keeping the rest in place. */
function retiredCopy(record: BankItem, retired: RetiredRecord): AnyItem {
  const source = editableCopy(record) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "retired") continue;
    out[key] = key === "status" ? "retired" : value;
    if (key === "status") out.retired = retired;
  }
  return out as unknown as AnyItem;
}

/** A batch's counts from its items, `override` standing for one item's new status. */
function countsOf(
  bank: Bank,
  batchId: string,
  override: { id: string; status: AnyItem["status"] },
): RegisterCounts {
  const statuses = batchItems(bank, batchId).map((record) =>
    record.id === override.id ? override.status : record.item.status,
  );
  const count = (status: string) =>
    statuses.filter((value) => value === status).length;
  return {
    accepted: count("active"),
    cut: count("cut"),
    retired: count("retired"),
  };
}

function lockMessage(itemId: string, locks: ScheduleLocks): string {
  const parts: string[] = [];
  if (locks.open > 0)
    parts.push(
      `${locks.open} main-track Daily(ies) that have not closed${locks.frozen > 0 ? ` (${locks.frozen} frozen)` : ""}`,
    );
  if (locks.spares > 0) parts.push(`${locks.spares} spare set(s)`);
  if (locks.challengePacks > 0)
    parts.push(`${locks.challengePacks} challenge pack(s)`);
  return `${itemId} is on ${parts.join(", ")}`;
}

/**
 * Validates a retirement and returns what to write. Throws an Error whose
 * message names the item, statuses and counts only.
 */
export async function planRetirement(
  bank: Bank,
  request: RetireRequest,
): Promise<RetirePlan> {
  const { itemId } = request;
  if (!agentId("ed").safeParse(request.editor).success)
    refuse(
      `--editor is an editor's agent id (ed-<run id>), not ${request.editor}`,
    );
  if (request.reason.trim() === "")
    refuse("--reason says why the item leaves play");
  if (!(RETIRE_KINDS as readonly string[]).includes(request.kind))
    refuse(`--kind is ${RETIRE_KINDS.join(", ")}`);
  const record = bank.itemsById.get(itemId);
  if (!record) {
    const pool = parseItemId(itemId)?.pool;
    if (bank.invalidIds.has(itemId))
      refuse(`${itemId} fails its schema; run npm run content:check`);
    refuse(
      `${itemId} is not an item of the bank${
        pool !== undefined &&
        pool !== "practice" &&
        bank.layout.kind === "content"
          ? "; sealed items are read from content/.sealed-plain/, so run npm run content:unseal first"
          : ""
      }`,
    );
  }
  if (record.file.fromEnvelope)
    refuse(
      `${itemId} was read from an envelope; run content:unseal and retire it in the workspace`,
    );
  const status = record.item.status;
  if (status === "draft" || status === "checking")
    refuse(
      `${itemId} is ${status}; retire takes active items only, and content:decide covers draft and checking items (cut, or rewrite and re-check)`,
    );
  if (status === "cut")
    refuse(`${itemId} is cut already; its id is never reused`);
  if (status === "retired")
    refuse(
      `${itemId} is retired already${record.item.retired ? `, by ${record.item.retired.by} at ${record.item.retired.at}` : ""}`,
    );
  const role = editorRefusal(bank, record, request.editor);
  if (role !== null) refuse(role);
  if (!record.file.sealed && request.kind === "cross_pool")
    refuse(
      `${itemId}'s file is public, and --kind cross_pool there would tell any reader that a Daily item shares its fact (ARCHITECTURE §5.4): retire it with --kind other and a neutral reason ("Overlaps another item; replaced.")`,
    );
  if (!record.file.sealed && namesSealedContent(request.reason))
    refuse(
      `the reason names sealed content (a sealed item, batch, list request or spare set, a Daily by its number or date, or the words Daily, mystery, encore or sealed), and ${itemId}'s file is public: nothing public names sealed content (ARCHITECTURE §5.4), so describe it without them`,
    );

  const locks = await scheduleLocks(bank, record, request.today);
  if (locks.unsealed > 0)
    refuse(
      `the workspace lacks ${locks.unsealed} schedule, spare or challenge-pack file(s) that content/sealed/ holds, so the schedule guard cannot see every Daily: run npm run content:unseal first`,
    );
  if (isLocked(locks) && !request.allowFrozen)
    refuse(
      `${lockMessage(itemId, locks)}. Pass --allow-frozen for a correction, as content:release takes it for frozen Dailies, and have the scheduler replace it there before the next release`,
    );

  const retired: RetiredRecord = {
    at: request.at,
    by: request.editor,
    kind: request.kind,
    reason: request.reason.trim(),
  };
  const item = retiredCopy(record, retired);
  const parsed = SCHEMAS[record.pool].safeParse(item);
  if (!parsed.success)
    refuse(
      `${itemId} would not pass its schema once retired: ${parsed.error.issues
        .map(
          (issue) => `${formatPath(issue.path) || "(item)"}: ${issue.message}`,
        )
        .join("; ")}`,
    );

  const parsedId = parseItemId(itemId);
  const batch =
    parsedId && bank.register ? batchForItem(bank.register, parsedId) : null;
  const register =
    batch?.status === "closed"
      ? {
          before: {
            accepted: batch.accepted,
            cut: batch.cut,
            retired: batch.retired ?? 0,
          },
          after: countsOf(bank, batch.batchId, {
            id: itemId,
            status: "retired",
          }),
        }
      : null;
  return {
    itemId,
    pool: record.pool,
    sealed: record.file.sealed,
    item,
    batchId: batch?.batchId ?? null,
    batchStatus: batch?.status ?? null,
    register,
    locks,
  };
}

/**
 * Writes a retirement: the item first (through the workspace guard for a
 * sealed item), then a closed batch's recount. If the second write fails,
 * `content:batch -- close` recounts the batch from its items.
 */
export async function applyRetirement(
  bank: Bank,
  plan: RetirePlan,
  options: SaveOptions = {},
): Promise<string[]> {
  const written = await saveItems(
    bank,
    new Map([[plan.itemId, plan.item]]),
    options,
  );
  const register = bank.register;
  if (plan.register && plan.batchId && register) {
    const entry = register.batches.find(
      (batch) => batch.batchId === plan.batchId,
    );
    if (!entry) throw new Error(`${plan.batchId} left the register`);
    entry.accepted = plan.register.after.accepted;
    entry.cut = plan.register.after.cut;
    if (plan.register.after.retired > 0)
      entry.retired = plan.register.after.retired;
    else delete entry.retired;
    await writeJsonFile(
      bank.layout.registerFile,
      BatchRegisterSchema.parse(register),
    );
    written.push(bank.layout.registerFile);
  }
  return written;
}
