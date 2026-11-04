"use client";

/**
 * Scroll padding from the real bars (RITE round 1, R1-12; DESIGN §10.2;
 * WCAG 2.4.11): what keyboard focus scrolls to lands between the sticky
 * header and the bar at the bottom, never under either.
 *
 * Render `<ScrollInset edge="top" />` inside a bar that covers the top of
 * the viewport (the top bar, the play header) and `edge="bottom"` inside
 * one that covers the bottom (the phone tab bar, a stop screen's dock). It
 * renders a hidden marker and measures the element it sits in, with a
 * `ResizeObserver`, so a banner sliding in, the practice segments' row or
 * 200% text all count. The tallest bar on each edge goes to `<html>` as
 * `--kn-inset-top` and `--kn-inset-bottom`, which `globals.css` turns into
 * `scroll-padding` (plus room for the 3 px focus ring at its 3 px offset)
 * and the tab pages' bottom padding. A bar that is `display: none` (the
 * tab bar from 768 px) measures 0. A bar whose route Next hides keeps
 * nothing: React detaches the refs of a hidden `<Activity>`, which
 * unregisters it, and the bar registers again when its route shows. Until
 * the page hydrates, the CSS falls back to the bars' usual heights.
 */
import type { Ref } from "react";

export type ScrollEdge = "top" | "bottom";

export const INSET_VARIABLES: Readonly<Record<ScrollEdge, string>> = {
  top: "--kn-inset-top",
  bottom: "--kn-inset-bottom",
};

const bars = new Map<Element, ScrollEdge>();
const heights = new Map<Element, number>();
let observer: ResizeObserver | null = null;

/** Writes the tallest registered bar of each edge to `<html>`. */
function publish(): void {
  const tallest: Record<ScrollEdge, number> = { top: 0, bottom: 0 };
  for (const [bar, edge] of bars) {
    tallest[edge] = Math.max(tallest[edge], heights.get(bar) ?? 0);
  }
  const style = document.documentElement.style;
  for (const edge of ["top", "bottom"] as const) {
    const value = `${Math.ceil(tallest[edge])}px`;
    if (style.getPropertyValue(INSET_VARIABLES[edge]) !== value) {
      style.setProperty(INSET_VARIABLES[edge], value);
    }
  }
}

function measure(bar: Element): number {
  return bar.getBoundingClientRect().height;
}

function watch(bar: Element, edge: ScrollEdge): () => void {
  bars.set(bar, edge);
  heights.set(bar, measure(bar));
  if (observer === null && typeof ResizeObserver === "function") {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (bars.has(entry.target)) {
          heights.set(entry.target, measure(entry.target));
        }
      }
      publish();
    });
  }
  observer?.observe(bar);
  publish();
  return () => {
    observer?.unobserve(bar);
    bars.delete(bar);
    heights.delete(bar);
    publish();
  };
}

function inset(edge: ScrollEdge): Ref<HTMLSpanElement> {
  return (marker) => {
    const bar = marker?.parentElement;
    if (bar === null || bar === undefined) return;
    return watch(bar, edge);
  };
}

/** One stable ref callback per edge, so React attaches each marker once. */
const INSETS: Readonly<Record<ScrollEdge, Ref<HTMLSpanElement>>> = {
  top: inset("top"),
  bottom: inset("bottom"),
};

export function ScrollInset({ edge }: { edge: ScrollEdge }) {
  return <span hidden data-scroll-inset={edge} ref={INSETS[edge]} />;
}
