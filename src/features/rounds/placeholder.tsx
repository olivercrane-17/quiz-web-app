/**
 * What a family's round component shows until its ticket builds it, so a
 * screen wired before the round merges says so instead of rendering
 * nothing.
 */
import type { RoundFamily } from "@/engine/types";

import { ROUNDS_COPY } from "./copy";

export function RoundPlaceholder({ family }: { family: RoundFamily }) {
  return (
    <p data-round-placeholder={family} className="py-6 text-base">
      {ROUNDS_COPY.notBuilt}
    </p>
  );
}
