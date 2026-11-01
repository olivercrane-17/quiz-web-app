/**
 * Button looks (DESIGN §6.1) as plain class names, so a server component can
 * style a `<Link>` as a button: `<Link className={buttonClasses({ variant:
 * "primary" })} href="/daily">`. The `<Button>` component uses the same
 * function. Greybox values; DS-1 restyles them.
 *
 * The disabled look keys off `disabled` or `data-disabled` (which `<Button>`
 * sets for a disabled control that stays focusable), never off `aria-busy`:
 * a busy button keeps its look and only adds the spinner. The pressed look
 * keys off `data-pressed` (set by `<Button>`) or `:active` (links).
 */
import { cx } from "./cx";

export const BUTTON_VARIANTS = [
  /** One per screen: "Play today's Daily", "Lock in", "Continue", "Done for today". */
  "primary",
  /** Everything else that matters: Share, Challenge, Quick play, offer-card actions. */
  "secondary",
  /** The Daily's Play and the join ticket: ink on the ticket. */
  "ticket",
  /** No fill until hover: Learn more, Report, I liked this, Rename. */
  "ghost",
  /** Only "Delete my data" and "Delete quiz", always behind a confirm step. */
  "danger",
  /** Underlined text with a 44 px hit area: "Choose a category". */
  "text",
  /** 44 by 44: Leave, close, settings, more. Needs an aria-label. */
  "icon",
] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonSize = "default" | "small";

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  className?: string;
}

const BASE =
  "relative inline-flex touch-manipulation items-center justify-center gap-2 font-bold whitespace-nowrap transition-transform duration-75 outline-offset-[3px] select-none focus-visible:outline-[3px] focus-visible:outline-foreground active:translate-y-0.5 data-pressed:translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed data-disabled:translate-y-0 data-disabled:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "min-h-14 rounded-2xl border-2 border-foreground bg-foreground px-6 text-[17px] text-background",
  secondary:
    "min-h-12 rounded-2xl border-[1.5px] border-foreground/70 bg-background px-5 text-foreground hover:bg-foreground/5",
  ticket:
    "min-h-14 rounded-2xl border-2 border-foreground bg-foreground px-6 text-[17px] text-background",
  ghost:
    "min-h-11 rounded-xl px-3 font-semibold text-foreground hover:bg-foreground/5",
  danger:
    "min-h-12 rounded-2xl border-2 border-dashed border-foreground bg-background px-5 text-foreground",
  text: "min-h-11 px-1 font-semibold text-foreground underline decoration-2 underline-offset-[3px]",
  icon: "size-11 rounded-xl text-foreground hover:bg-foreground/5",
};

const DISABLED =
  "disabled:border-foreground/30 disabled:bg-muted disabled:text-muted-foreground data-disabled:border-foreground/30 data-disabled:bg-muted data-disabled:text-muted-foreground";

export function buttonClasses({
  variant = "secondary",
  size = "default",
  block = false,
  className,
}: ButtonClassOptions = {}): string {
  return cx(
    BASE,
    VARIANTS[variant],
    size === "small" &&
      variant !== "icon" &&
      "min-h-11 rounded-[14px] px-4 text-base",
    block && "w-full",
    variant !== "text" && variant !== "ghost" && variant !== "icon" && DISABLED,
    className,
  );
}
