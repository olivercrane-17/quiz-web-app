/**
 * The nickname field's words (PRD §3.10.6, §3.12.1; DESIGN §12.19). MOD-1
 * owns them.
 */
export const NICKNAME_COPY = {
  /** Under a custom field: the name used when the field is left empty. */
  customHint: (generated: string) =>
    `Leave it empty to be ${generated}. Up to 24 characters.`,
  /** Under the generated-name picker (13 to 17, PRD §3.10.6). */
  generatedHint: "Names are made up for you, so nobody's real name shows.",
  /** The picker's button (DESIGN §5: the `shuffle` icon). */
  shuffle: "Shuffle name",
  /**
   * With the age band unknown: typing a custom name asks it first (PRD
   * §3.10.6), so the field offers this and its caller asks.
   */
  typeOwn: "Type your own name",
  /** The slur filter's answer, the same for every hit (PRD AC-GRP-07, AC-SET-08). */
  blocked: "Please choose a different name.",
} as const;

/** Custom names: 1 to 24 characters (PRD §3.12.1, Display name). */
export const NICKNAME_MAX_LENGTH = 24;

/**
 * How long typing must pause before the filter's answer shows and is
 * spoken, so a short word on its way to a longer, innocent one never
 * flashes a refusal, and a screen reader hears one answer rather than one
 * per keystroke (as the Encore preview does, R1-34).
 */
export const FILTER_SETTLE_MS = 600;
