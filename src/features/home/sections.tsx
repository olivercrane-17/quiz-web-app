/**
 * Extension point (ARCHITECTURE §2.3): Today's slots, in DESIGN §12.1's
 * order. Each feature fills its own `home-slot.tsx` or `home-notice.tsx`;
 * this file never needs to change for them.
 *
 * Phones (one column): the Daily, at most one notice, Practice, This week,
 * review, challenges, the Group row, then the Beta rows. From 1024 px, two
 * columns: the Daily, the notice and Practice on the left (7/12), the rest
 * on the right (5/12). A slot that renders nothing leaves no gap.
 *
 * **Notices.** DESIGN §12.1 allows one card above Practice at a time, in
 * this priority: the streak repair card (the archive slot, ARC-1), a freeze
 * or protection note (`StreakNotice`, STK-1), the restore-success note
 * (`RestoreNotice`, IDN-2). Each sits in its own `data-home-notice` wrapper,
 * and CSS hides every notice that follows one with content, so only the
 * first notice with content shows and none reaches into another. A notice
 * with nothing to say renders nothing.
 *
 * **Practice promoted.** When any slot renders an element with
 * `data-home-promote="practice"` (the Daily card's offline state, PRD
 * §3.1.7), the Practice card shows above the Daily. A CSS reorder would
 * leave focus and reading order starting at the Daily (WCAG 1.3.2, 2.4.3),
 * so Practice renders in both places, as the tab bar does with its two
 * lists, and CSS shows one (`:has()`): `placement="promoted"` before the
 * Daily, `placement="regular"` after the notices. The other copy is
 * `display: none`, out of the tab order and the accessibility tree.
 *
 * **Size** (§10.9 item 2; Home had about 8.4 kB of its 150 kB left after
 * Wave 0). This is a Server Component that imports every slot statically,
 * and Next does not code-split a Client Component that a Server Component
 * imports, so whatever a slot file imports lands in Home's first load. So:
 * - Every slot and notice file stays a small "use client" wrapper that
 *   renders null or a fixed-size placeholder, and loads its card with
 *   `dynamic(() => import("./home-card"))` from inside the slot.
 * - Beta slots (rooms, editor) check `isFeatureEnabled()` before that
 *   import: the flags are a parsed object, so a minifier never drops a
 *   static import behind them.
 * - Eager islands and their byte targets (gzipped): the Daily card 4 kB,
 *   Quick play 1 kB, the streak chip 1 kB, the incident banner 1 kB.
 *   Everything else is lazy.
 */
import { ArchiveHomeSlot } from "@/features/archive/home-slot";
import { ChallengesHomeSlot } from "@/features/challenges/home-slot";
import { DailyHomeSlot } from "@/features/daily/home-slot";
import { EditorHomeSlot } from "@/features/editor/home-slot";
import { GroupsHomeSlot } from "@/features/groups/home-slot";
import { RestoreNotice } from "@/features/identity/home-notice";
import { PracticeHomeSlot } from "@/features/practice/home-slot";
import { ReviewHomeSlot } from "@/features/review/home-slot";
import { RoomsHomeSlot } from "@/features/rooms/home-slot";
import { StreakNotice } from "@/features/streaks/home-notice";
import { StreaksHomeSlot } from "@/features/streaks/home-slot";

const SLOT = "empty:hidden";
const COLUMN = "contents lg:flex lg:flex-col lg:gap-3";
/** Hidden when empty, or when an earlier notice has content. */
const NOTICE = "order-2 empty:hidden [[data-home-notice]:not(:empty)~&]:hidden";

export function HomeSections() {
  return (
    <div
      data-home-sections=""
      className="group/home flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-6"
    >
      <div className={`${COLUMN} lg:col-span-7`}>
        <div
          data-home-slot="practice-promoted"
          className="order-1 hidden group-has-[[data-home-promote=practice]]/home:[&:not(:empty)]:block"
        >
          <PracticeHomeSlot placement="promoted" />
        </div>
        <div data-home-slot="daily" className={`order-1 ${SLOT}`}>
          <DailyHomeSlot />
        </div>
        <div data-home-slot="archive" data-home-notice="" className={NOTICE}>
          <ArchiveHomeSlot />
        </div>
        <div
          data-home-slot="streak-notice"
          data-home-notice=""
          className={NOTICE}
        >
          <StreakNotice />
        </div>
        <div
          data-home-slot="restore-notice"
          data-home-notice=""
          className={NOTICE}
        >
          <RestoreNotice />
        </div>
        <div
          data-home-slot="practice"
          className={`order-3 group-has-[[data-home-promote=practice]]/home:hidden ${SLOT}`}
        >
          <PracticeHomeSlot placement="regular" />
        </div>
      </div>
      <div className={`${COLUMN} lg:col-span-5`}>
        <div data-home-slot="streaks" className={`order-4 ${SLOT}`}>
          <StreaksHomeSlot />
        </div>
        <div data-home-slot="review" className={`order-5 ${SLOT}`}>
          <ReviewHomeSlot />
        </div>
        <div data-home-slot="challenges" className={`order-6 ${SLOT}`}>
          <ChallengesHomeSlot />
        </div>
        <div data-home-slot="groups" className={`order-7 ${SLOT}`}>
          <GroupsHomeSlot />
        </div>
        <div data-home-slot="rooms" className={`order-8 ${SLOT}`}>
          <RoomsHomeSlot />
        </div>
        <div data-home-slot="editor" className={`order-9 ${SLOT}`}>
          <EditorHomeSlot />
        </div>
      </div>
    </div>
  );
}
