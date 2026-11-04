/**
 * The newt mark (DESIGN §1.5): an eft curled into a question mark. The head
 * is the ball terminal, the body the hook, the tail tapers into the stem,
 * and the dot stays a dot. The geometry is docs/design/final/mark.js's
 * output, on a 48 by 48 grid, at three detail levels:
 *
 * - `small` (16 to 27 px): body, head and dot, a plain "?".
 * - `mid` (28 to 47 px, the top bar): adds the bent legs and two eyes.
 * - `full` (48 px and up): the toes at full weight.
 *
 * Colours come from the surface it sits on (`.kn-mark` in shell.css): eft
 * body, ink eyes and dot on paper; charcoal eyes and a cream dot in dark.
 * Always decorative: the name beside it, or the caller's label, carries
 * the meaning. Never rotated, animated or put on a play screen.
 */
import { cx } from "./cx";

export type MarkDetail = "small" | "mid" | "full";

const BODY =
  "M11.94 17.49C11.91 17.2 11.8 16.38 11.78 15.79C11.75 15.2 11.79 14.56 11.79 13.96C11.78 13.36 11.71 12.81 11.75 12.18C11.78 11.55 11.83 10.83 12.01 10.2C12.19 9.56 12.49 8.95 12.81 8.37C13.13 7.79 13.51 7.25 13.92 6.72C14.33 6.19 14.78 5.67 15.27 5.21C15.77 4.74 16.36 4.28 16.91 3.93C17.46 3.58 18.01 3.34 18.59 3.1C19.18 2.86 19.83 2.67 20.41 2.5C21 2.34 21.48 2.22 22.09 2.12C22.7 2.01 23.46 1.92 24.1 1.87C24.74 1.82 25.32 1.81 25.92 1.83C26.52 1.85 27.11 1.9 27.68 1.99C28.26 2.08 28.79 2.19 29.38 2.36C29.97 2.52 30.62 2.75 31.21 2.99C31.79 3.24 32.36 3.53 32.9 3.84C33.44 4.15 33.93 4.47 34.44 4.87C34.96 5.27 35.51 5.74 36 6.22C36.48 6.7 36.94 7.21 37.33 7.76C37.73 8.31 38.08 8.9 38.36 9.51C38.64 10.12 38.86 10.78 39.01 11.43C39.17 12.09 39.26 12.8 39.31 13.44C39.35 14.07 39.33 14.62 39.3 15.25C39.27 15.87 39.23 16.56 39.1 17.19C38.96 17.83 38.74 18.47 38.49 19.04C38.23 19.62 37.9 20.11 37.57 20.64C37.24 21.16 36.87 21.7 36.5 22.18C36.12 22.66 35.72 23.14 35.31 23.53C34.9 23.91 34.5 24.19 34.06 24.51C33.62 24.82 33.12 25.12 32.65 25.41C32.18 25.69 31.71 25.95 31.26 26.21C30.82 26.47 30.4 26.74 30 26.98C29.6 27.23 29.25 27.43 28.87 27.66C28.5 27.9 28.1 28.14 27.77 28.41C27.43 28.67 27.12 28.93 26.87 29.26C26.61 29.59 26.4 29.99 26.23 30.38C26.06 30.78 25.96 31.18 25.84 31.63C25.72 32.07 25.57 32.59 25.5 33.05C25.42 33.51 25.49 34.06 25.4 34.37C25.3 34.68 25.1 34.89 24.93 34.9C24.76 34.91 24.52 34.74 24.4 34.43C24.29 34.12 24.28 33.54 24.24 33.03C24.19 32.52 24.11 31.91 24.14 31.37C24.17 30.83 24.27 30.31 24.42 29.78C24.57 29.24 24.79 28.68 25.03 28.16C25.28 27.64 25.56 27.15 25.89 26.68C26.22 26.21 26.63 25.75 27.02 25.35C27.41 24.96 27.82 24.65 28.22 24.34C28.61 24.03 29.02 23.79 29.38 23.49C29.75 23.19 30.1 22.86 30.42 22.53C30.74 22.2 31.05 21.83 31.32 21.49C31.59 21.16 31.79 20.86 32.03 20.53C32.26 20.2 32.54 19.87 32.74 19.53C32.94 19.18 33.12 18.82 33.23 18.46C33.34 18.11 33.35 17.76 33.4 17.4C33.44 17.04 33.46 16.68 33.48 16.32C33.5 15.97 33.54 15.59 33.51 15.26C33.48 14.93 33.4 14.66 33.3 14.36C33.19 14.06 33.04 13.75 32.89 13.46C32.74 13.18 32.56 12.93 32.38 12.67C32.2 12.41 32.02 12.16 31.82 11.91C31.62 11.67 31.41 11.42 31.16 11.19C30.92 10.97 30.62 10.75 30.35 10.57C30.07 10.38 29.8 10.24 29.5 10.09C29.2 9.95 28.88 9.82 28.55 9.71C28.21 9.59 27.84 9.48 27.5 9.4C27.16 9.31 26.85 9.25 26.51 9.19C26.17 9.12 25.81 9.07 25.44 9.02C25.08 8.98 24.7 8.94 24.3 8.93C23.9 8.92 23.42 8.93 23.04 8.95C22.66 8.98 22.36 9.01 22.01 9.08C21.67 9.15 21.29 9.26 20.96 9.37C20.62 9.48 20.34 9.6 20.01 9.73C19.69 9.85 19.34 9.98 19.03 10.13C18.72 10.28 18.41 10.44 18.15 10.64C17.89 10.83 17.67 11.07 17.47 11.31C17.27 11.56 17.12 11.83 16.94 12.11C16.76 12.4 16.54 12.7 16.4 13.01C16.26 13.33 16.11 13.65 16.1 14C16.09 14.35 16.21 14.76 16.32 15.11C16.43 15.47 16.68 15.95 16.75 16.12Z";

/** The three bent legs: upper limb and knee, then three short toes. */
const LEGS = [
  {
    limb: "M12.57 10.41L9.31 9.68L8.01 11.64",
    toes: "M8.01 11.64l0.39 1.49M8.01 11.64l-0.45 1.16M8.01 11.64l-1.29 0.84",
  },
  {
    limb: "M38.7 15.25L42.1 15.74L42.61 18.04",
    toes: "M42.61 18.04l-0.9 1.25M42.61 18.04l0 1.25M42.61 18.04l0.9 1.25",
  },
  {
    limb: "M34.1 16.2L31.55 16.38L30.77 18.6",
    toes: "M30.77 18.6l0.74 1.35M30.77 18.6l-0.16 1.24M30.77 18.6l-1.05 1.13",
  },
] as const;

export function NewtMark({
  size = 36,
  detail = size < 28 ? "small" : size < 48 ? "mid" : "full",
  className,
}: {
  /** Pixels; the mark is square. */
  size?: number;
  /** Picked from `size` by DESIGN's thresholds unless given. */
  detail?: MarkDetail;
  className?: string;
}) {
  const small = detail === "small";
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      data-detail={detail}
      className={cx("kn-mark", className)}
    >
      <g className="kn-mark-body">
        <path d={BODY} />
        <ellipse
          cx="14.77"
          cy="18.44"
          rx={small ? 5 : 4.8}
          ry={small ? 4.6 : 4.35}
          transform="rotate(75.15 14.77 18.44)"
        />
        <ellipse
          cx="15.21"
          cy="20.09"
          rx="3.6"
          ry="3.3"
          transform="rotate(75.15 15.21 20.09)"
        />
      </g>
      {small ? null : (
        <g className="kn-mark-legs">
          {LEGS.map((leg) => (
            <g key={leg.limb}>
              <path d={leg.limb} strokeWidth={1.9} />
              <path
                d={leg.toes}
                strokeWidth={detail === "full" ? 1.05 : 1.15}
              />
            </g>
          ))}
        </g>
      )}
      {small ? null : (
        <>
          <circle className="kn-mark-eye" cx="13.29" cy="21.22" r="0.95" />
          <circle className="kn-mark-eye" cx="17.44" cy="20.12" r="0.95" />
        </>
      )}
      <circle
        className="kn-mark-dot"
        cx="25.1"
        cy="42.2"
        r={small ? 3.9 : 3.7}
      />
    </svg>
  );
}
