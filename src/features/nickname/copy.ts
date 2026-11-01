/** The nickname field's words (PRD §3.10.6). MOD-1 owns them from Wave 11. */
export const NICKNAME_COPY = {
  /** Under a custom field: the name used when the field is left empty. */
  customHint: (generated: string) =>
    `Leave it empty to be ${generated}. Up to 24 characters.`,
  generatedHint: "Names are made up for you, so nobody's real name shows.",
} as const;

/** Custom names: 1 to 24 characters (PRD §3.12.1, Display name). */
export const NICKNAME_MAX_LENGTH = 24;
