"use client";

/**
 * The tooltip under a play header's X (RITE round 4, R4-04): what leaving
 * does, on screen for a mouse or a keyboard before the press. It was only
 * in the X's accessible name, so a sighted player learnt "the stopwatch
 * keeps running" from the toast, after leaving.
 *
 * shell.css shows it while the X is hovered or holds focus
 * (`.kn-playbar-leave`), and the pointer may move onto it. Escape puts it
 * away without moving either (WCAG 1.4.13); it comes back the next time the
 * pointer or focus arrives. It is hidden from screen readers, which have
 * the same words in the X's name.
 */
import { useEffect, useRef } from "react";

export function LeaveTip({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tip = ref.current;
    const leave = tip?.parentElement;
    if (tip === null || leave === null || leave === undefined) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") tip.dataset.off = "";
    };
    const restore = () => {
      delete tip.dataset.off;
    };
    document.addEventListener("keydown", dismiss);
    leave.addEventListener("pointerenter", restore);
    leave.addEventListener("focusin", restore);
    return () => {
      document.removeEventListener("keydown", dismiss);
      leave.removeEventListener("pointerenter", restore);
      leave.removeEventListener("focusin", restore);
    };
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-leave-tip=""
      className="kn-playbar-tip"
    >
      {children}
    </span>
  );
}
