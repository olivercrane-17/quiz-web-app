/**
 * The round plugin registry (ARCHITECTURE §4.4, §2.3). It imports one module
 * per family and never changes after CORE-0a: PRA-1 fills ./choice, MYS-1
 * fills ./mystery and ./encore, and ./ordering stays a stub.
 */
import type { RoundType } from "../types/rounds.ts";
import { choicePlugin } from "./choice/index.ts";
import { encorePlugin } from "./encore/index.ts";
import { mysteryPlugin } from "./mystery/index.ts";
import { orderingPlugin } from "./ordering/index.ts";
import type { AnyRoundPlugin, PluginRegistry } from "./types.ts";

export const PLUGINS: PluginRegistry = {
  mc: choicePlugin,
  tf: choicePlugin,
  comparison: choicePlugin,
  mystery: mysteryPlugin,
  encore: encorePlugin,
  ordering: orderingPlugin,
};

export function pluginFor(type: RoundType): AnyRoundPlugin {
  return PLUGINS[type];
}

export type {
  Announcement,
  AnyRoundPlugin,
  EntityLookup,
  EntityRecord,
  IntentCheck,
  IntentError,
  JudgeContext,
  JudgeError,
  JudgeResult,
  PluginRegistry,
  RoundPlugin,
} from "./types.ts";
export { PluginNotBuiltError, UnsupportedRoundTypeError } from "./types.ts";
