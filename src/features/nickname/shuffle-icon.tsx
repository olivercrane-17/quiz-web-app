/**
 * Lucide's `shuffle` (DESIGN §5: "Shuffle name"), drawn inline on its
 * 24 px grid like the icons in src/ui/icons.tsx, whose licence notice
 * (src/ui/LICENSE-lucide.txt) covers it. Decorative: the button's words
 * carry the meaning.
 */
import { cx } from "@/ui/cx";
import { iconStroke, type IconProps } from "@/ui/icons";

export function ShuffleIcon({ className, size = 20 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={iconStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", className)}
    >
      <path d="m18 14 4 4-4 4" />
      <path d="m18 2 4 4-4 4" />
      <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-7.6a4 4 0 0 1 3.3-1.7H22" />
      <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" />
      <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />
    </svg>
  );
}
