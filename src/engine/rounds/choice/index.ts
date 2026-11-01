/**
 * The choice plugin (mc, tf, comparison; ARCHITECTURE §4.4.1). A Wave 0
 * stub with the final export: PRA-1 fills both halves, keeping the name
 * `choicePlugin` and family `choice`, so rounds/index.ts never changes.
 */
import type { ChoiceItem } from "../../types/content.ts";
import {
  PluginNotBuiltError,
  type AnyRoundPlugin,
  type RoundPlugin,
} from "../types.ts";

/** What the judge half reads: a practice item or sealed choice content. */
export type ChoiceContent = Omit<ChoiceItem, "predicted">;

const notBuilt = (): never => {
  throw new PluginNotBuiltError("choice", "PRA-1");
};

export const choicePlugin: RoundPlugin<
  "choice",
  ChoiceContent,
  unknown,
  unknown
> = {
  family: "choice",
  types: ["mc", "tf", "comparison"],
  maxPoints: () => 1,
  init: notBuilt,
  check: notBuilt,
  apply: notBuilt,
  outcome: notBuilt,
  announce: notBuilt,
  open: notBuilt,
  judge: notBuilt,
} satisfies AnyRoundPlugin;
