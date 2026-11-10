"use client";

/**
 * The Lock in bar under a Mystery's options (D31, RITE round 4, R4-01):
 * the one button that sends the pick, as the Encore's Lock in sends its
 * number. It is held at the bottom of the screen while the options are in
 * view, as the Encore's result holds "See your results": under the thumb,
 * and in the same place before and after a choice, so nothing moves when
 * it wakes. Until an option is chosen it reads "Lock in" and is disabled,
 * still focusable so a keyboard or a screen reader finds it; then it names
 * the choice, "Lock in Cobalt". The bar bleeds over the play column's 16 px
 * gutters, its height is the page's bottom scroll inset, and toasts rise
 * above it.
 */
import { ScrollInset } from "@/features/shell/client";
import { Button } from "@/ui/button";

import { MYSTERY_COPY } from "./copy";
export interface LockInBarProps {
  /** The chosen option's label, or null before a choice. */
  label: string | null;
  disabled: boolean;
  busy: boolean;
  onLockIn(): void;
}

export function LockInBar({ label, disabled, busy, onLockIn }: LockInBarProps) {
  const copy = MYSTERY_COPY.options;
  return (
    <div
      data-lock-in-bar=""
      data-toast-anchor=""
      className="sticky bottom-0 z-10 -mx-4 mt-3 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <ScrollInset edge="bottom" />
      <Button
        variant="primary"
        block
        disabled={disabled}
        focusableWhenDisabled
        busy={busy}
        data-lock-in=""
        onClick={onLockIn}
      >
        {label === null ? copy.lockIn : copy.lockInNamed(label)}
      </Button>
    </div>
  );
}
