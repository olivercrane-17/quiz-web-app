/**
 * One run holds one role on an item (CONTENT_GUIDE §0.2). An editor may act
 * on an item, by retiring it or by judging a cross-pool pair it belongs to
 * (CNT-2b), only when the editor's run is none of the item's writer, its
 * checkers (passes A, B and T, follow-ups, pass D and later re-checks) or
 * its estimators. content:decide holds the editor to the same rule
 * (decisions.ts). Run ids are compared as register.ts compares them, so
 * `w-abc` and `ed-ABC` are one run.
 */
import type { AnyItem } from "../schema/items.ts";
import type { Bank, BankItem } from "./bank.ts";
import { batchForItem, parseItemId } from "./ids.ts";
import { anyAgentRun, sameAgentRun } from "./register.ts";

/** The writer of an item's batch, from the register, or null without one. */
export function writerOf(bank: Bank, itemId: string): string | null {
  if (!bank.register) return null;
  const parsed = parseItemId(itemId);
  if (!parsed) return null;
  return batchForItem(bank.register, parsed)?.writer ?? null;
}

/** Every checker run recorded on an item, in any pass. */
export function checkersOf(item: AnyItem): string[] {
  const v = item.verification;
  return [
    ...(v?.checks ?? []),
    ...(v?.tiebreak ? [v.tiebreak] : []),
    ...(v?.followUps ?? []),
    ...(v?.dailyChecks ?? []),
    ...(v?.rechecks ?? []),
  ].map((check) => check.checker);
}

/** Every estimator run recorded on an item. */
export function estimatorRunsOf(item: AnyItem): string[] {
  return (item.verification?.estimates ?? []).map((estimate) => estimate.by);
}

export type HeldRole = "writer" | "checker" | "estimator";

/**
 * The role `agent`'s run already holds on the item, or null when it holds
 * none and may act on it as its editor.
 */
export function roleHeld(
  bank: Bank,
  record: BankItem,
  agent: string,
): HeldRole | null {
  if (sameAgentRun(agent, writerOf(bank, record.id))) return "writer";
  if (anyAgentRun(agent, checkersOf(record.item))) return "checker";
  if (anyAgentRun(agent, estimatorRunsOf(record.item))) return "estimator";
  return null;
}

const VERB: Record<HeldRole, string> = {
  writer: "wrote",
  checker: "checked",
  estimator: "estimated",
};

/**
 * Why `editor` may not act on the item, naming that item only, or null.
 * Each message names one item, so no line joins a public item to a sealed
 * one (ARCHITECTURE §5.4).
 */
export function editorRefusal(
  bank: Bank,
  record: BankItem,
  editor: string,
): string | null {
  const role = roleHeld(bank, record, editor);
  return role === null
    ? null
    : `${editor} ${VERB[role]} ${record.id}; one run holds one role on an item, so another editor decides (CONTENT_GUIDE §0.2)`;
}
