"use client";

/**
 * A line that names today by the device's own date, filled before first
 * paint (ARCHITECTURE §10.3, §1.4 item 9): the home card's "Daily #42 ·
 * Sunday 1 November".
 *
 * The prerendered page can't know the device's date, so the HTML holds a
 * placeholder of the same width, kept invisible, and an inline script right
 * after the slot fills it while the HTML parses. `suppressHydrationWarning`
 * keeps what the script wrote, so hydration changes nothing and logs no
 * mismatch; the island then renders the same text. On a client navigation
 * the script doesn't run, and the island renders the text on its first
 * render. Without scripts the slot stays an invisible placeholder that
 * holds its space.
 *
 * `{n}` in the template is the day's Daily number (1 on `epoch`); `{weekday}`,
 * `{day}` and `{month}` name the device's local date with the words given,
 * Sunday and January first. The device clock is read only in the browser
 * (ARCHITECTURE §10.2 rule 4).
 */
import { useSyncExternalStore } from "react";

import { cx } from "./cx";
import {
  dateSlotScript,
  dateSlotText,
  type DateSlotProps,
} from "./date-slot-text";
import { InlineScript } from "./inline-script";

export {
  dateSlotScript,
  dateSlotText,
  type DateSlotProps,
  type DateSlotWords,
} from "./date-slot-text";

function never(): () => void {
  return () => {};
}

export function DateSlot(props: DateSlotProps) {
  const { id, placeholder, className } = props;
  const text = useSyncExternalStore(
    never,
    () => dateSlotText(new Date(), props),
    () => null,
  );
  return (
    <>
      <span
        id={id}
        data-date-slot=""
        data-pending={text === null ? "" : undefined}
        suppressHydrationWarning
        className={cx("kn-date-slot", className)}
      >
        {text ?? placeholder}
      </span>
      <InlineScript html={dateSlotScript(props)} />
    </>
  );
}
