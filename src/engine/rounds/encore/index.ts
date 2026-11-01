/**
 * The encore plugin (closest number; ARCHITECTURE §4.4.1). A Wave 0 stub
 * with the final export: MYS-1 fills both halves, keeping the name
 * `encorePlugin` and family `encore`, so rounds/index.ts never changes.
 */
import type { EncoreContent } from "../../types/content.ts";
import {
  PluginNotBuiltError,
  type AnyRoundPlugin,
  type RoundPlugin,
} from "../types.ts";

const notBuilt = (): never => {
  throw new PluginNotBuiltError("encore", "MYS-1");
};

export const encorePlugin: RoundPlugin<
  "encore",
  EncoreContent,
  unknown,
  unknown
> = {
  family: "encore",
  types: ["encore"],
  maxPoints: () => 0,
  init: notBuilt,
  check: notBuilt,
  apply: notBuilt,
  outcome: notBuilt,
  announce: notBuilt,
  open: notBuilt,
  judge: notBuilt,
} satisfies AnyRoundPlugin;
