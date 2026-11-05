/**
 * Extension point (ARCHITECTURE §2.3): the streak chip in Today's top bar
 * (DESIGN §6.8). The tabs header renders `<StreakChip />`.
 *
 * A stub until STK-1. The chip is hidden until the first finished Daily,
 * so rendering nothing is also its first real state. Size: one of the
 * islands Home loads eagerly (§10.9 item 2), with a byte target of 1 kB
 * gzipped; the streak sheet it opens loads with dynamic().
 */
export function StreakChip() {
  return null;
}
