/**
 * The stopwatch (DESIGN §6.7): the timer icon and `m:ss` in tabular
 * figures, `ink-2`, 36 px tall. Silent to screen readers as it ticks
 * (`aria-live="off"`); they read it when they reach it, after the label
 * ("Time 1:12"). Under 360 px the icon drops so the digits keep their room.
 * Its type and height are in px, so 200% text never grows it past 36 px
 * (the header's other parts grow instead, R1-03).
 *
 * It only shows a time: the screen owns the clock (it runs only while a
 * round is open) and the "Hide stopwatch" choice. With `onClick` it is a
 * button that opens the More menu at "Hide stopwatch", drawn as a pill on
 * a `rule` border with a 44 px hit area, and it takes the menu button's
 * ARIA (`aria-haspopup`, `aria-expanded`, `aria-controls`) and a `ref` to
 * return focus to; without, it is a flat reading with no edge, so it never
 * looks like something to tap (RITE round 1, R1-27).
 */
import type { MouseEvent, Ref } from "react";

import { cx } from "./cx";
import { TimerIcon } from "./icons";

export interface StopwatchProps {
  /** The time as shown, `m:ss`: "1:12". */
  time: string;
  /** Read before the time: "Time". */
  label: string;
  /** Opens the More menu; the event's `currentTarget` is the opener. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** The button form only: the menu it opens. */
  "aria-haspopup"?: "menu" | "dialog";
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  /** A hint beside it that describes it ("Time only breaks ties."). */
  "aria-describedby"?: string;
  ref?: Ref<HTMLButtonElement>;
  className?: string;
}

export function Stopwatch({
  time,
  label,
  onClick,
  "aria-haspopup": hasPopup,
  "aria-expanded": expanded,
  "aria-controls": controls,
  "aria-describedby": describedBy,
  ref,
  className,
}: StopwatchProps) {
  const body = (
    <>
      <TimerIcon size={17} />
      <span className="sr-only">{label}</span> {time}
    </>
  );
  return onClick === undefined ? (
    <p
      aria-live="off"
      aria-describedby={describedBy}
      data-stopwatch=""
      className={cx("kn-watch", className)}
    >
      {body}
    </p>
  ) : (
    <button
      ref={ref}
      type="button"
      aria-live="off"
      aria-haspopup={hasPopup}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-describedby={describedBy}
      data-stopwatch=""
      onClick={onClick}
      className={cx("kn-watch", className)}
    >
      {body}
    </button>
  );
}
