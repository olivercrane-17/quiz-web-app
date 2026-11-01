/**
 * Extension point (ARCHITECTURE §2.3): Today's slots, in DESIGN §12.1's
 * order. Each feature fills its own `home-slot.tsx`; this file never needs
 * to change for them.
 *
 * Phones (one column): the Daily, the repair card, Practice, This week,
 * review, challenges, the Group row, then the Beta rows. From 1024 px, two
 * columns: the Daily and Practice on the left (7/12), the rest on the right
 * (5/12). A slot that renders nothing leaves no gap.
 *
 * The Practice card moves above the Daily when any slot renders an element
 * with `data-home-promote="practice"` (the Daily card's offline state, PRD
 * §3.1.7). That is CSS (`:has()`), so no slot reaches into another.
 */
import { ArchiveHomeSlot } from "@/features/archive/home-slot";
import { ChallengesHomeSlot } from "@/features/challenges/home-slot";
import { DailyHomeSlot } from "@/features/daily/home-slot";
import { EditorHomeSlot } from "@/features/editor/home-slot";
import { GroupsHomeSlot } from "@/features/groups/home-slot";
import { PracticeHomeSlot } from "@/features/practice/home-slot";
import { ReviewHomeSlot } from "@/features/review/home-slot";
import { RoomsHomeSlot } from "@/features/rooms/home-slot";
import { StreaksHomeSlot } from "@/features/streaks/home-slot";

const SLOT = "empty:hidden";
const COLUMN = "contents lg:flex lg:flex-col lg:gap-3";

export function HomeSections() {
  return (
    <div
      data-home-sections=""
      className="group/home flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-6"
    >
      <div className={`${COLUMN} lg:col-span-7`}>
        <div data-home-slot="daily" className={`order-1 ${SLOT}`}>
          <DailyHomeSlot />
        </div>
        <div data-home-slot="archive" className={`order-2 ${SLOT}`}>
          <ArchiveHomeSlot />
        </div>
        <div
          data-home-slot="practice"
          className={`order-3 group-has-[[data-home-promote=practice]]/home:order-first ${SLOT}`}
        >
          <PracticeHomeSlot />
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
