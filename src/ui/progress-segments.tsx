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
 * caller passes a mark), wrong an X and a dashed edge, voided a dash and a
 * dotted edge. The looks are `.kn-progress` and `.kn-step` in `ui.css`:
 * pills of 38 by 30 in Fraunces (32 wide under 360 px), the current one
 * with an ink border and a ledge; slim 20 px segments for practice, the
 * current one outlined in ink. Both keep their size at 200% text.
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
  /** Set the mark in italic, as the Encore's E is (DESIGN §6.6). */
  italic?: boolean;
}

export interface ProgressSegmentsProps {
  /** Names the list: "Daily progress", or practice's running summary. */
  label: string;
  segments: readonly ProgressSegment[];
  /** `pills`: the Daily header; `bar`: practice's slim segments. */
  variant?: "pills" | "bar";
  className?: string;
}

function Mark({ segment, size }: { segment: ProgressSegment; size: number }) {
  switch (segment.status) {
    case "correct":
      return segment.mark ?? <CheckIcon size={size} />;
    case "wrong":
      return segment.mark ?? <CrossIcon size={size} />;
    case "voided":
      return <DashIcon size={size} />;
    case "upcoming":
    case "done":
      return segment.mark ?? null;
  }
}

export function ProgressSegments({
  label,
  segments,
  variant = "pills",
  className,
}: ProgressSegmentsProps) {
  return (
    <ol
      // Preflight's list-style: none makes WebKit drop the list role (and
      // with it this name) for VoiceOver unless the role is explicit.
      role="list"
      aria-label={label}
      data-variant={variant}
      className={cx("kn-progress", className)}
    >
      {segments.map((segment, index) => (
        <li
          key={index}
          data-status={segment.status}
          data-current={segment.current ? "" : undefined}
          aria-current={segment.current ? "step" : undefined}
          data-italic={segment.italic ? "" : undefined}
          className="kn-step"
        >
          <span aria-hidden="true" className="inline-flex">
            <Mark segment={segment} size={variant === "pills" ? 16 : 13} />
          </span>
          <span className="sr-only">{segment.label}</span>
        </li>
      ))}
    </ol>
  );
}
