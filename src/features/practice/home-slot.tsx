/**
 * Extension point (ARCHITECTURE §2.3): Today's practice slot, composed by
 * src/features/home/sections.tsx. It holds the Practice card: "Ten questions
 * on anything. Works offline." and Quick play (DESIGN §12.1, AC-PRA-01).
 * "Choose a category" joins it with PRA-2, together with the /practice
 * setup it opens.
 *
 * Today renders it twice and CSS shows one copy: `placement="regular"`
 * after the Daily and its notices, and `placement="promoted"` before the
 * Daily, shown only while a slot promotes Practice (the Daily card's
 * offline state, PRD §3.1.7). Keyboard and reading order then follow what
 * is on screen in every browser, which a CSS reorder would not (WCAG 1.3.2,
 * 2.4.3). The copy not on screen is `display: none`; only the copy on
 * screen may count an impression or warm anything up, so check
 * `element.checkVisibility()` first, and use `placement` in analytics. The
 * copy off screen never prefetches either: Next prefetches a link only
 * once it is in the viewport.
 *
 * Size (§10.9 items 1 and 2): this is a Server Component, so the card's
 * text and class names are HTML. The only client code is the Quick play
 * link's click handler (`QuickPlayLink`, the 1 kB eager island), which gets
 * its label and classes from here.
 */
import { buttonClasses } from "@/ui/button-classes";
import { Card } from "@/ui/card";

import { PRACTICE_COPY } from "./copy";
import { QuickPlayLink } from "./quick-play-link";

export interface PracticeHomeSlotProps {
  placement: "regular" | "promoted";
}

export function PracticeHomeSlot({ placement }: PracticeHomeSlotProps) {
  const titleId = `practice-card-title-${placement}`;
  return (
    <Card
      as="section"
      aria-labelledby={titleId}
      data-practice-card={placement}
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-lg font-bold">
          {PRACTICE_COPY.card.title}
        </h2>
        <p className="text-base text-muted-foreground">
          {PRACTICE_COPY.card.line}
        </p>
      </div>
      <QuickPlayLink
        className={buttonClasses({
          variant: "secondary",
          size: "small",
          className: "self-start sm:self-auto",
        })}
      >
        {PRACTICE_COPY.quickPlay}
      </QuickPlayLink>
    </Card>
  );
}
