/**
 * Extension point (ARCHITECTURE §2.3, §4.9): the round components, keyed by
 * family, as the engine's plugin registry is keyed by round type. PRA-1
 * fills ./choice and MYS-1 fills ./mystery and ./encore; this file never
 * changes for them. A new round type adds one entry here, next to its
 * engine plugin.
 *
 * `ordering` is reserved: v1 has no ordering content, and its engine plugin
 * throws `unsupported_round_type`, so it has no component.
 */
import type { RoundFamily } from "@/engine/types";

import { ChoiceRound } from "./choice";
import type { RoundComponent } from "./contracts";
import { EncoreRound } from "./encore";
import { MysteryRound } from "./mystery";

export type PlayableFamily = Exclude<RoundFamily, "ordering">;

export const ROUND_COMPONENTS: Readonly<
  Record<PlayableFamily, RoundComponent>
> = {
  choice: ChoiceRound,
  mystery: MysteryRound,
  encore: EncoreRound,
};

/** The component for a family, or null for one with no v1 component. */
export function roundComponentFor(family: RoundFamily): RoundComponent | null {
  return family === "ordering" ? null : ROUND_COMPONENTS[family];
}
