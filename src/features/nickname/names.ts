/**
 * Generated names for the nickname picker: an adjective and an animal from
 * the reviewed lists in content/names/ ("Plucky Otter", PRD §3.10.1), the
 * same lists `register_player` and `set_nickname` read from
 * `private.name_parts`. The lists are checked so that no pair holds a
 * listed term and every pair fits the 24-character limit
 * (scripts/codegen/moderation-sql.ts).
 */
import { NAME_ADJECTIVES, NAME_ANIMALS } from "@/content/generated/names";

/** A number in [0, 1) from `crypto.getRandomValues`. */
export function randomUnit(): number {
  const [value] = globalThis.crypto.getRandomValues(new Uint32Array(1));
  return (value ?? 0) / 2 ** 32;
}

function index(unit: number, length: number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(unit * length)));
}

/**
 * Another generated name, never `current`, so every press of Shuffle shows
 * a change. Two draws from `random` (an adjective, then an animal); a pair
 * equal to `current` takes the next animal instead.
 */
export function shuffleName(
  current: string,
  random: () => number = randomUnit,
): string {
  if (NAME_ADJECTIVES.length === 0 || NAME_ANIMALS.length === 0) {
    return current;
  }
  const adjective = NAME_ADJECTIVES[index(random(), NAME_ADJECTIVES.length)];
  let animal = index(random(), NAME_ANIMALS.length);
  if (`${adjective} ${NAME_ANIMALS[animal]}` === current) {
    animal = (animal + 1) % NAME_ANIMALS.length;
  }
  return `${adjective} ${NAME_ANIMALS[animal]}`;
}
