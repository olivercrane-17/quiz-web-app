/**
 * Loading placeholders (PRD §3.0.2, DESIGN §12): nothing for the first
 * 300 ms, then a skeleton shaped like the final layout, so nothing shifts
 * when the content arrives (CLS under 0.05).
 *
 * `<Loading>` holds the space from the first frame and reveals its shapes
 * after the 300 ms grace with a CSS transition from `@starting-style`, so
 * there is no timer and it works in a server component. Browsers without
 * `@starting-style` show the shapes at once. It marks itself `aria-busy`
 * and carries a visually hidden label; the shapes are decorative. The
 * shapes are `sunken` and pulse gently, except under reduced motion
 * (`.kn-skel` in `ui.css`).
 */
import type { CSSProperties, ReactNode } from "react";

import { UI_COPY } from "./copy";
import { cx } from "./cx";

export type SkeletonShape = "line" | "block" | "circle";

export interface SkeletonProps {
  shape?: SkeletonShape;
  /** Any CSS length; lines fill their container by default. */
  width?: string;
  height?: string;
  className?: string;
}

/** One decorative placeholder shape. Put it inside `<Loading>`. */
export function Skeleton({
  shape = "line",
  width,
  height,
  className,
}: SkeletonProps) {
  const style: CSSProperties = {};
  if (width !== undefined) style.width = width;
  if (height !== undefined) style.height = height;
  return (
    <span
      aria-hidden="true"
      data-skeleton={shape}
      className={cx("kn-skel", className)}
      style={style}
    />
  );
}

/** Lines of text: the last one shorter, as a paragraph's last line usually is. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, line) => (
        <Skeleton
          key={line}
          width={line === lines - 1 && lines > 1 ? "60%" : undefined}
        />
      ))}
    </span>
  );
}

export interface LoadingProps {
  /** What a screen reader hears on the region: "Loading today's Daily". */
  label?: string;
  /** Skip the 300 ms grace, for a skeleton that replaces content already on screen. */
  immediate?: boolean;
  /** The skeleton shapes, laid out like the content they stand for. */
  children: ReactNode;
  className?: string;
}

export function Loading({
  label = UI_COPY.loading,
  immediate = false,
  children,
  className,
}: LoadingProps) {
  return (
    <div aria-busy="true" data-loading="" className={className}>
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className={immediate ? undefined : "kn-loading-shapes"}
      >
        {children}
      </div>
    </div>
  );
}
