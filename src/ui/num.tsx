/**
 * A data numeral (DESIGN §3.3): scores, counts, guesses and axis labels are
 * set in Fraunces lining figures, because Atkinson's zero is always
 * slashed. Numbers inside prose sentences stay in the text face.
 */
import type { HTMLAttributes } from "react";

import { cx } from "./cx";

export function Num({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("kn-num", className)} {...rest} />;
}
