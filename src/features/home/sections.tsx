/**
 * Extension point (ARCHITECTURE §2.3): Today's slots, in DESIGN §12.1's
 * order. Each feature fills its own `home-slot.tsx` or `home-notice.tsx`;
 * this file never needs to change for them. The layout is `home.css`.
 *
 * Phones and tablets (one column): the Daily, at most one notice,
 * Practice, This week, review, challenges, the Group row, then the Beta
 * rows. From 1024 px, two columns (DESIGN §10.1): the Daily, the notice
 * and Practice on the left (7/12), the rest on the right (5/12). While
 * the right column has nothing to show (before STK-1's This week card),
 * Practice takes its place beside the ticket, so Today is two columns from
 * 1024 px from day one instead of one column hugging the left (RITE round
 * 1, R1-35). A slot that renders nothing leaves no gap.
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
 * §3.1.7), the Practice card shows above the Daily (before it, on the
 * left, when the two sit side by side). A CSS reorder would leave focus
 * and reading order starting at the Daily (WCAG 1.3.2, 2.4.3), so Practice
 * renders in both places, as the tab bar does with its two lists, and CSS
 * shows one (`:has()`): `placement="promoted"` before the Daily,
 * `placement="regular"` after the notices. The other copy is
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

export function HomeSections() {
  return (
    <div data-home-sections="" className="kn-home">
      <div data-home-column="left" className="kn-home-column">
        <div data-home-slot="practice-promoted" className="kn-home-slot">
          <PracticeHomeSlot placement="promoted" />
        </div>
        <div data-home-slot="daily" className="kn-home-slot">
          <DailyHomeSlot />
        </div>
        <div
          data-home-slot="archive"
          data-home-notice=""
          className="kn-home-slot"
        >
          <ArchiveHomeSlot />
        </div>
        <div
          data-home-slot="streak-notice"
          data-home-notice=""
          className="kn-home-slot"
        >
          <StreakNotice />
        </div>
        <div
          data-home-slot="restore-notice"
          data-home-notice=""
          className="kn-home-slot"
        >
          <RestoreNotice />
        </div>
        <div data-home-slot="practice" className="kn-home-slot">
          <PracticeHomeSlot placement="regular" />
        </div>
      </div>
      <div data-home-column="right" className="kn-home-column">
        <div data-home-slot="streaks" className="kn-home-slot">
          <StreaksHomeSlot />
        </div>
        <div data-home-slot="review" className="kn-home-slot">
          <ReviewHomeSlot />
        </div>
        <div data-home-slot="challenges" className="kn-home-slot">
          <ChallengesHomeSlot />
        </div>
        <div data-home-slot="groups" className="kn-home-slot">
          <GroupsHomeSlot />
        </div>
        <div data-home-slot="rooms" className="kn-home-slot">
          <RoomsHomeSlot />
        </div>
        <div data-home-slot="editor" className="kn-home-slot">
          <EditorHomeSlot />
        </div>
      </div>
    </div>
  );
}
