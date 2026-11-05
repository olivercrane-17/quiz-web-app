/**
 * Button looks (DESIGN §6.1) as plain class names, so a server component can
 * style a `<Link>` as a button: `<Link className={buttonClasses({ variant:
 * "primary" })} href="/daily">`. The `<Button>` component uses the same
 * function. The looks live in `ui.css` (`.kn-btn` and its variants), so a
 * client chunk carries a few short names rather than the styles.
 *
 * The disabled look keys off `disabled` or `data-disabled` (which `<Button>`
 * sets for a disabled control that stays focusable), never off `aria-busy`:
 * a busy button keeps its look and only adds the spinner. The pressed look
 * keys off `data-pressed` (set by `<Button>`) or `:active` (links). A link
 * that can't be followed yet sets `data-disabled` itself.
 */
import { cx } from "./cx";

export const BUTTON_VARIANTS = [
  /** One per screen: "Play today's Daily", "Lock in", "Continue", "Done for today". */
  "primary",
  /** Everything else that matters: Share, Challenge, Quick play, offer-card actions. */
  "secondary",
  /** The Daily's Play and the join ticket: ink on the eft ticket, cream in dark. */
  "ticket",
  /** No fill until hover: Learn more, Report, I liked this, Rename. */
  "ghost",
  /** Only "Delete my data" and "Delete quiz", always behind a confirm step. */
  "danger",
  /** Ink text with an eft underline and a 44 px hit area: "Choose a category". */
  "text",
  /** 44 by 44: Leave, close, settings, more. Needs an aria-label. */
  "icon",
] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonSize = "default" | "small";

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  /** `small`: 44 px tall with a 3 px ledge, for buttons inside cards. */
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  className?: string;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "kn-btn-primary",
  secondary: "kn-btn-secondary",
  ticket: "kn-btn-ticket",
  ghost: "kn-btn-ghost",
  danger: "kn-btn-danger",
  text: "kn-btn-text",
  icon: "kn-btn-icon",
};

/** The variants that have a ledge, and so a small size. */
const SIZED = new Set<ButtonVariant>([
  "primary",
  "secondary",
  "ticket",
  "danger",
]);

export function buttonClasses({
  variant = "secondary",
  size = "default",
  block = false,
  className,
}: ButtonClassOptions = {}): string {
  return cx(
    "kn-btn",
    VARIANT_CLASS[variant],
    size === "small" && SIZED.has(variant) && "kn-btn-sm",
    block && "kn-btn-block",
    className,
  );
}
