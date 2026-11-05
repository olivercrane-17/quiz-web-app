/**
 * Which content this build plays (ARCHITECTURE §5.6, §7.4): the bank,
 * generated from content/ and fetched from the CDN, or the fixture world,
 * generated from content/fixtures/ alone. The two never mix. A mock build
 * plays the fixture realm end to end: its Dailies come from the mock
 * backend, and its practice packs and answer lists from the fixture world,
 * so a typed guess finds the fixture entities the mock's Mysteries name.
 * Every other build plays the real bank.
 *
 * The backend layer chooses, because only it reads the backend mode
 * (§2.2): `src/backend/index.ts` selects the world as it loads, which is
 * before any island reaches a loader, since each awaits `bootClient()`
 * and that imports `@/backend`. With no selection, unit tests (where
 * NODE_ENV is "test" and the mock backend runs) get the fixture world and
 * anything else gets the bank, so production can never fall back to
 * fixtures.
 */
export type ContentWorld = "bank" | "fixtures";

let selected: ContentWorld | null = null;

/** Called once by the backend layer for the build's backend mode. */
export function selectContentWorld(world: ContentWorld): void {
  selected = world;
}

export function contentWorld(): ContentWorld {
  if (selected !== null) return selected;
  return process.env.NODE_ENV === "test" ? "fixtures" : "bank";
}

/** Tests only: forgets the selection. */
export function resetContentWorldForTests(): void {
  selected = null;
}
