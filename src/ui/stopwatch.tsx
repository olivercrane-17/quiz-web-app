/**
 * The stopwatch pill (DESIGN §6.7): the timer icon and `m:ss` in tabular
 * figures, `ink-2` on a `rule` border, 36 px tall with a 44 px hit area.
 * Silent to screen readers as it ticks (`aria-live="off"`); they read it
 * when they reach it, after the label ("Time 1:12"). Under 360 px the icon
 * drops so the digits keep their room.
 *
 * It only shows a time: the screen owns the clock (it runs only while a
 * round is open) and the "Hide stopwatch" choice. With `onClick` the pill
 * is a button that opens the More menu at "Hide stopwatch".
 */
import { cx } from "./cx";
import { TimerIcon } from "./icons";

export interface StopwatchProps {
  /** The time as shown, `m:ss`: "1:12". */
  time: string;
  /** Read before the time: "Time". */
  label: string;
  onClick?: () => void;
  className?: string;
}

export function Stopwatch({ time, label, onClick, className }: StopwatchProps) {
  const body = (
    <>
      <TimerIcon size={17} />
      <span className="sr-only">{label}</span> {time}
    </>
  );
  return onClick === undefined ? (
    <p aria-live="off" data-stopwatch="" className={cx("kn-watch", className)}>
      {body}
    </p>
  ) : (
    <button
      type="button"
      aria-live="off"
      data-stopwatch=""
      onClick={onClick}
      className={cx("kn-watch", className)}
    >
      {body}
    </button>
  );
}
