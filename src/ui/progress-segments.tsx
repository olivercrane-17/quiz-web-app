/**
 * Progress through a run (DESIGN §6.6): the Daily header's four pills (M1
 * to M3 and an italic E) and practice's ten segments.
 *
 * Each step carries a status and, separately, whether it is the current
 * one, so "solved and current" is expressible. The visible marks are
 * hidden from screen readers; each step has its own label ("Mystery 2,
 * solved on clue 2") and the list has a name, which for practice is the
 * whole summary ("Question 4 of 10. 3 right, 1 wrong so far."). The
 * current step carries `aria-current="step"`.
 *
 * Never colour alone: correct shows a check (or the points earned, when the
 * caller passes a mark), wrong an X and a dashed edge, voided a dash.
 */
import { cx } from "./cx";
import { CheckIcon, CrossIcon, DashIcon } from "./icons";

export type SegmentStatus =
  /** Not reached yet (or reached and still open: see `current`). */
  | "upcoming"
  | "correct"
  | "wrong"
  /** A withdrawn round (PRD §3.13.4). */
  | "voided"
  /** Resolved with no right or wrong, such as an Encore locked in. */
  | "done";

export interface ProgressSegment {
  status: SegmentStatus;
  current?: boolean;
  /** What screen readers hear for this step: "Mystery 2, playing now". */
  label: string;
  /**
   * The visible text: "1", "E", or the points earned ("3") in place of a
   * check. Hidden from screen readers, which hear `label`.
   */
  mark?: string;
}

export interface ProgressSegmentsProps {
  /** Names the list: "Daily progress", or practice's running summary. */
  label: string;
  segments: readonly ProgressSegment[];
  /** `pills`: the Daily header; `bar`: practice's slim segments. */
  variant?: "pills" | "bar";
  className?: string;
}

function Mark({ segment }: { segment: ProgressSegment }) {
  switch (segment.status) {
    case "correct":
      return segment.mark ?? <CheckIcon size={16} />;
    case "wrong":
      return segment.mark ?? <CrossIcon size={16} />;
    case "voided":
      return <DashIcon size={16} />;
    case "upcoming":
    case "done":
      return segment.mark ?? null;
  }
}

const STATUS_CLASSES: Record<SegmentStatus, string> = {
  upcoming: "border-foreground/40",
  correct: "border-foreground bg-foreground text-background",
  wrong: "border-dashed border-foreground bg-foreground/10",
  voided: "border-dotted border-foreground/60",
  done: "border-foreground bg-foreground/10",
};

export function ProgressSegments({
  label,
  segments,
  variant = "pills",
  className,
}: ProgressSegmentsProps) {
  return (
    <ol
      aria-label={label}
      data-variant={variant}
      className={cx(
        "flex items-center",
        variant === "pills" ? "gap-1.5" : "w-full gap-1",
        className,
      )}
    >
      {segments.map((segment, index) => (
        <li
          key={index}
          data-status={segment.status}
          data-current={segment.current ? "" : undefined}
          aria-current={segment.current ? "step" : undefined}
          className={cx(
            "inline-grid shrink-0 place-items-center border-2 font-bold tabular-nums",
            variant === "pills"
              ? "h-[30px] min-w-[38px] rounded-[10px] px-1.5 text-sm"
              : "h-5 min-w-0 flex-1 rounded-md text-xs",
            STATUS_CLASSES[segment.status],
            segment.current && "outline-2 outline-offset-1 outline-foreground",
          )}
        >
          <span aria-hidden="true" className="inline-flex">
            <Mark segment={segment} />
          </span>
          <span className="sr-only">{segment.label}</span>
        </li>
      ))}
    </ol>
  );
}
