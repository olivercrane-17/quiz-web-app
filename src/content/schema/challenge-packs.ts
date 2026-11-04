/**
 * Challenge packs (ARCHITECTURE §5.1.1, PRD §3.6.1): sealed files in
 * `challenge-packs/<id>.json`, assembled from past Dailies once 30 have
 * closed everywhere, so none exists at launch. The release loads them into
 * `challenge_packs` on the file's track.
 */
import { z } from "zod";

import { text } from "./primitives.ts";
import { RoundRecordSchema } from "./schedule.ts";

export const ChallengePackSchema = z.strictObject({
  id: z
    .string()
    .regex(
      /^(?:fx-)?[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "challenge pack ids are kebab-case",
    ),
  track: z.enum(["main", "e2e"]),
  title: text,
  theme: text,
  /** The rounds in play order, as schedule records name them (§2.11). */
  rounds: z.array(RoundRecordSchema).min(1),
});
export type ChallengePack = z.infer<typeof ChallengePackSchema>;
