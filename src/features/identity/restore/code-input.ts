/**
 * The restore field's grouping as you type (DESIGN §12.26): what the
 * player types or pastes is read the way the server reads it (§9.2,
 * AC-SYN-02: any case, spaces and hyphens ignored, I and L as 1, O as 0),
 * shown in groups of four (`K7QX-2M9P-T4RW-8HNC`), at most 16 characters,
 * and the caret stays after the character it followed.
 */
import { normalizeCrockford } from "@/engine/types";

const CODE_LENGTH = 16;
const GROUP = 4;

/** The code characters in `text`: normalized, letters and digits only. */
function codeCharacters(text: string): string {
  return normalizeCrockford(text).replace(/[^0-9A-Z]/g, "");
}

/** The field's text for what was typed. */
export function formatTypedCode(raw: string): string {
  const characters = codeCharacters(raw).slice(0, CODE_LENGTH);
  return characters.match(new RegExp(`.{1,${GROUP}}`, "g"))?.join("-") ?? "";
}

/** How many code characters come before `caret` in what was typed. */
export function codeCharactersBefore(raw: string, caret: number): number {
  return Math.min(CODE_LENGTH, codeCharacters(raw.slice(0, caret)).length);
}

/** The caret's place in the grouped text, after its `count`th code character. */
export function caretAfter(count: number): number {
  if (count <= 0) return 0;
  return count + Math.floor((count - 1) / GROUP);
}
