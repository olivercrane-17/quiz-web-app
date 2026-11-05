"use client";

/**
 * Pieces every Mystery and Encore reveal shares (PRD §3.0.3, §3.1.4,
 * §3.1.5, §3.13.4): "Learn more" as a Wikipedia search for the answer,
 * the sources line, the withdrawn card of a voided round, and the points
 * count-up.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";

import { buttonClasses } from "@/ui/button-classes";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";

import { focusReveal } from "../viewport";
import { MYSTERY_COPY } from "./copy";
import { continueOnEnter, focusTargetProps } from "./focus";
import { BookOpenIcon } from "./icons";
import { TONE, enter } from "./tones";

/** A Wikipedia search for the answer, never a hand-typed article URL (PRD §3.18.3). */
export function wikipediaSearchUrl(name: string): string {
  return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`;
}

export function LearnMoreLink({ name }: { name: string }) {
  return (
    <a
      href={wikipediaSearchUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClasses({ variant: "ghost" })}
    >
      <BookOpenIcon size={20} />
      {MYSTERY_COPY.reveal.learnMore}{" "}
      <span className="sr-only">
        {MYSTERY_COPY.reveal.learnMoreAbout(name)}
      </span>
    </a>
  );
}

export function SourcesLine({
  labels,
  format,
}: {
  labels: readonly string[];
  format: (labels: readonly string[]) => string;
}) {
  if (labels.length === 0) return null;
  return (
    <p className={cx("mt-2 text-[0.8125rem] font-semibold", TONE.ink3)}>
      {format(labels)}
    </p>
  );
}

/**
 * Counts up to `target` from 400 to 900 ms (PRD §3.0.3, DESIGN §7.4): null
 * until the count starts, then 1 up to `target`, so a solve never reads
 * "+0" (R1-33). Under reduced motion, or for nothing to count, it is the
 * final value at once.
 */
export function useCountUp(
  target: number,
  reducedMotion: boolean,
): number | null {
  const animate = !reducedMotion && target > 0;
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!animate) return;
    const frame =
      typeof window.requestAnimationFrame === "function"
        ? (step: FrameRequestCallback) => window.requestAnimationFrame(step)
        : (step: FrameRequestCallback) =>
            window.setTimeout(() => {
              step(performance.now());
            }, 16);
    const cancel =
      typeof window.cancelAnimationFrame === "function"
        ? (handle: number) => {
            window.cancelAnimationFrame(handle);
          }
        : (handle: number) => {
            window.clearTimeout(handle);
          };
    let handle = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const elapsed = now - start - 400;
      const progress = Math.min(1, Math.max(0, elapsed / 500));
      setShown(elapsed < 0 ? null : Math.max(1, Math.round(progress * target)));
      if (progress < 1) handle = frame(tick);
    };
    handle = frame(tick);
    return () => {
      cancel(handle);
    };
  }, [animate, target]);
  return animate ? shown : target;
}

/**
 * Focus `ref` once, when the element mounts (AC-DLY-18: the reveal
 * heading). A reveal card (`[data-reveal]`) replaces its round in place,
 * often above the screen once the page has scrolled to the options: its
 * heading takes focus without the browser's scroll, which would leave the
 * heading at the screen's top edge with the stamp and kicker under the
 * sticky header, and the card then starts just below the header (R1-12,
 * `focusReveal`). A heading outside such a card, like the Encore's result
 * line under its field, is brought into view by the browser as it takes
 * focus. A layout effect, so the reveal never paints in the wrong place.
 */
export function useFocusOnMount<T extends HTMLElement>(): Ref<T> {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const heading = ref.current;
    if (heading === null) return;
    const card = heading.closest<HTMLElement>("[data-reveal]");
    if (card === null) heading.focus({ preventScroll: false });
    else focusReveal(heading, card);
  }, []);
  return ref;
}

export interface WithdrawnCardProps {
  kicker: ReactNode;
  title: string;
  body: string | null;
  continueLabel: string;
  onContinue(): void;
  reducedMotion: boolean;
}

/** A voided round (PRD §3.13.4): nobody sees the wrong reveal. */
export function WithdrawnCard({
  kicker,
  title,
  body,
  continueLabel,
  onContinue,
  reducedMotion,
}: WithdrawnCardProps) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section
      data-reveal="withdrawn"
      onKeyDown={continueOnEnter(onContinue)}
      className={cx("flex flex-col gap-3 py-4", enter("card", reducedMotion))}
    >
      <p className={cx("text-[0.8125rem] font-bold", TONE.ink3)}>{kicker}</p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        {...focusTargetProps("reveal_heading")}
        className="text-2xl leading-tight font-bold text-balance outline-none"
      >
        {title}
      </h1>
      {body === null ? null : (
        <p className="text-[1.0625rem] leading-normal">{body}</p>
      )}
      <Button variant="primary" block onClick={onContinue} className="mt-4">
        {continueLabel}
      </Button>
    </section>
  );
}
