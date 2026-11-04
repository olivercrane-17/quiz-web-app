/**
 * The text of a date slot and the inline script that writes it (see
 * ./date-slot.tsx). Plain TypeScript, so a spec can load it without React.
 */

/** JSON for a script body: `<` escaped, so no value can close the tag. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export interface DateSlotWords {
  /** Sunday first. */
  weekdays: readonly string[];
  /** January first. */
  months: readonly string[];
}

export interface DateSlotProps extends DateSlotWords {
  /** The slot's element id, unique on the page: "qz-daily-slot". */
  id: string;
  /** The date of Daily #1, `YYYY-MM-DD` (`DAILY_EPOCH`). */
  epoch: string;
  /** "Daily #{n} · {weekday} {day} {month}". */
  template: string;
  /** Text as wide as a long line ("Daily #00 · Wednesday 30 September"), never shown. */
  placeholder: string;
  className?: string;
}

const DAY_MS = 86_400_000;

function utcDay(date: string): number {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** The slot's text at `now`, in the device's zone. The inline script does the same. */
export function dateSlotText(
  now: Date,
  {
    epoch,
    template,
    weekdays,
    months,
  }: Omit<DateSlotProps, "id" | "placeholder" | "className">,
): string {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const number = Math.round((today - utcDay(epoch)) / DAY_MS) + 1;
  return template
    .split("{n}")
    .join(String(number))
    .split("{weekday}")
    .join(weekdays[now.getDay()] ?? "")
    .split("{day}")
    .join(String(now.getDate()))
    .split("{month}")
    .join(months[now.getMonth()] ?? "");
}

/** The inline script: fills the slot and shows it, and never throws. */
export function dateSlotScript({
  id,
  epoch,
  template,
  weekdays,
  months,
}: Omit<DateSlotProps, "placeholder" | "className">): string {
  const config = scriptJson({
    i: id,
    e: epoch,
    t: template,
    w: weekdays,
    m: months,
  });
  return (
    `(function(){try{var c=${config},s=document.getElementById(c.i);if(!s)return;` +
    `var n=new Date(),e=c.e.split("-"),` +
    `k=Math.round((Date.UTC(n.getFullYear(),n.getMonth(),n.getDate())-Date.UTC(+e[0],e[1]-1,+e[2]))/864e5)+1;` +
    `s.textContent=c.t.split("{n}").join(k).split("{weekday}").join(c.w[n.getDay()]||"")` +
    `.split("{day}").join(n.getDate()).split("{month}").join(c.m[n.getMonth()]||"");` +
    `s.removeAttribute("data-pending")}catch(x){}})()`
  );
}
