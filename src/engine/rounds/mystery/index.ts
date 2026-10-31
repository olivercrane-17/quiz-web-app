/**
 * The mystery plugin (the clue ladder; ARCHITECTURE §4.4.1). A Wave 0 stub
 * with the final export: MYS-1 fills both halves, keeping the name
 * `mysteryPlugin` and family `mystery`, so rounds/index.ts never changes.
 */
import type { MysteryContent } from "../../types/content.ts";
import {
  PluginNotBuiltError,
  type AnyRoundPlugin,
  type RoundPlugin,
} from "../types.ts";

const notBuilt = (): never => {
  throw new PluginNotBuiltError("mystery", "MYS-1");
};

export const mysteryPlugin: RoundPlugin<
  "mystery",
  MysteryContent,
  unknown,
  unknown
> = {
  family: "mystery",
  types: ["mystery"],
  maxPoints: () => 4,
  init: notBuilt,
  check: notBuilt,
  apply: notBuilt,
  outcome: notBuilt,
  announce: notBuilt,
  open: notBuilt,
  judge: notBuilt,
} satisfies AnyRoundPlugin;
