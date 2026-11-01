/**
 * The plugins a practice run needs: choice, for its three formats
 * (ARCHITECTURE §4.4.1). Practice never imports the full registry
 * (`@/engine/rounds`), so /practice/run carries no Mystery or Encore rules,
 * just as its screen imports ChoiceRound alone (§2.3). The other round types
 * keep the ordering stub, which refuses every call: a practice run never
 * holds one.
 */
import { choicePlugin } from "@/engine/rounds/choice";
import { orderingPlugin } from "@/engine/rounds/ordering";
import type { PluginRegistry } from "@/engine/rounds/types";

export const PRACTICE_PLUGINS: PluginRegistry = {
  mc: choicePlugin,
  tf: choicePlugin,
  comparison: choicePlugin,
  mystery: orderingPlugin,
  encore: orderingPlugin,
  ordering: orderingPlugin,
};
