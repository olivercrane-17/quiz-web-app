"use client";

/**
 * A button with the full state set of DESIGN §6.1: hover (pointer devices
 * only), pressed on `pointerdown` with the action on `click`, a focus ring,
 * disabled, and busy.
 *
 * - `disabled` uses the native attribute, so the control leaves the tab
 *   order. `focusableWhenDisabled` keeps it focusable with `aria-disabled`
 *   instead, for a control that must stay reachable to explain why.
 * - `busy` keeps the label, adds a spinner after it, sets `aria-busy` and
 *   ignores presses; after 1.5 s the label becomes "Checking…" (PRD §3.0.2).
 *
 * For a link styled as a button, use `buttonClasses()` on the `<Link>`.
 */
import {
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithRef,
  type PointerEvent,
} from "react";

import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./button-classes";
import { UI_COPY } from "./copy";
import { Spinner } from "./icons";
import { usePressed } from "./use-pressed";

export type ButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "disabled" | "type"
> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  /** With `disabled`: stay focusable (`aria-disabled`) so the control can explain itself. */
  focusableWhenDisabled?: boolean;
  /** A request is in flight: spinner, `aria-busy`, presses ignored. */
  busy?: boolean;
  /** Replaces the label once busy for `slowAfterMs`. */
  slowLabel?: string;
  slowAfterMs?: number;
};

/** True once `active` has lasted `afterMs`; resets whenever `active` turns off. */
function useLasted(active: boolean, afterMs: number): boolean {
  // One token per busy spell, so a timer from an earlier spell never counts.
  const spell = useMemo<object | null>(() => (active ? {} : null), [active]);
  const [lasted, setLasted] = useState<object | null>(null);
  useEffect(() => {
    if (spell === null) return;
    const timer = setTimeout(() => {
      setLasted(spell);
    }, afterMs);
    return () => {
      clearTimeout(timer);
    };
  }, [spell, afterMs]);
  return spell !== null && lasted === spell;
}

export function Button({
  variant = "secondary",
  size = "default",
  block = false,
  type = "button",
  disabled = false,
  focusableWhenDisabled = false,
  busy = false,
  slowLabel = UI_COPY.checking,
  slowAfterMs = 1500,
  className,
  children,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...rest
}: ButtonProps) {
  const blocked = disabled || busy;
  const nativeDisabled = disabled && !focusableWhenDisabled && !busy;
  const [pressed, press] = usePressed(!blocked);
  const slow = useLasted(busy, slowAfterMs);

  return (
    <button
      {...rest}
      type={type}
      disabled={nativeDisabled}
      aria-disabled={blocked && !nativeDisabled ? true : undefined}
      aria-busy={busy ? true : undefined}
      data-variant={variant}
      data-size={size}
      data-disabled={disabled ? "" : undefined}
      data-pressed={pressed ? "" : undefined}
      className={buttonClasses({ variant, size, block, className })}
      onClick={(event) => {
        if (blocked) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        press.onPointerDown(event);
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        press.onPointerUp();
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        press.onPointerCancel();
        onPointerCancel?.(event);
      }}
      onPointerLeave={(event) => {
        press.onPointerLeave();
        onPointerLeave?.(event);
      }}
    >
      {busy && slow ? slowLabel : children}
      {busy ? <Spinner /> : null}
    </button>
  );
}
