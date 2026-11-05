/**
 * A segmented control: one choice of a few, shown side by side (the
 * practice difficulty: Easy ●○○, Medium ●●○, Hard ●●●, Mixed; PRD §3.3.3,
 * DESIGN §12.6).
 *
 * Native radio buttons in a named group underneath, so arrow keys move the
 * choice, forms work, and screen readers say "Medium, radio button, 2 of 4,
 * checked". The picked segment is raised on surface with an ink edge, and
 * forced colours give it a Highlight border, so the choice never rests on
 * colour alone.
 *
 * A segment stacks the parts of its label, so pips go on their own line
 * under the word: pass them as two children, `<>Medium<Pips level={2}
 * /></>` (`Pips` from ./icons). Stacked, DESIGN §12.6's four choices need
 * about 275 px and share one row from 320 px; at 200% text the segments
 * wrap onto a second row rather than squeeze.
 */
import type { ReactNode } from "react";

import { cx } from "./cx";

export interface SegmentedOption<V extends string> {
  value: V;
  /**
   * What the segment shows, stacked: the word, then any pips. Its text is
   * the radio's name, so the pips (hidden from screen readers) add nothing
   * to it.
   */
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<V extends string> {
  /** The group's name, as a legend: "Difficulty". */
  legend: string;
  /** Keep the legend for screen readers only, when a heading nearby says it. */
  hideLegend?: boolean;
  /** The radios' `name`, unique on the page. */
  name: string;
  value: V;
  options: readonly SegmentedOption<V>[];
  onChange: (value: V) => void;
  className?: string;
}

export function SegmentedControl<V extends string>({
  legend,
  hideLegend = false,
  name,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<V>) {
  return (
    <fieldset className={cx("flex min-w-0 flex-col gap-2", className)}>
      <legend className={hideLegend ? "sr-only" : "mb-2 text-meta text-ink-3"}>
        {legend}
      </legend>
      <div className="kn-segmented">
        {options.map((option) => (
          <label key={option.value} className="kn-segment">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => {
                onChange(option.value);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
