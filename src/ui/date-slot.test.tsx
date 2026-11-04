import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DAILY_EPOCH } from "@/config/shared";

import {
  DateSlot,
  dateSlotScript,
  dateSlotText,
  type DateSlotProps,
} from "./date-slot";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const PROPS: DateSlotProps = {
  id: "qz-daily-slot",
  epoch: DAILY_EPOCH,
  template: "Daily #{n} · {weekday} {day} {month}",
  weekdays: WEEKDAYS,
  months: MONTHS,
  placeholder: "Daily #00 · Wednesday 30 September",
};

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** Runs the slot's inline script as the HTML parser would. */
function runScript(source: string): void {
  new Function(source)();
}

describe("the date slot", () => {
  it("names today and its Daily number", () => {
    // Sunday 1 November 2026, 09:00 local: Daily #42 (the fixture schedule).
    expect(dateSlotText(new Date(2026, 10, 1, 9), PROPS)).toBe(
      "Daily #42 · Sunday 1 November",
    );
    const [year = 0, month = 1, day = 1] = DAILY_EPOCH.split("-").map(Number);
    expect(dateSlotText(new Date(year, month - 1, day, 23, 59), PROPS)).toMatch(
      /^Daily #1 · /,
    );
  });

  it("the inline script writes exactly what the island renders, all year", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const slot = document.createElement("span");
    slot.id = PROPS.id;
    slot.dataset.pending = "";
    document.body.append(slot);
    const script = dateSlotScript(PROPS);
    // Every 7 hours through 2027, so each hour of the day comes round.
    for (
      let at = Date.UTC(2026, 9, 25);
      at < Date.UTC(2028, 0, 2);
      at += 7 * 3_600_000
    ) {
      vi.setSystemTime(at);
      runScript(script);
      expect(slot.textContent).toBe(dateSlotText(new Date(), PROPS));
    }
    expect(slot).not.toHaveAttribute("data-pending");
  });

  it("fills the prerendered slot before React runs, and hydration keeps it without a mismatch", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 1, 9));
    // The prerender knows no date: an invisible placeholder of the same width.
    const container = document.createElement("div");
    container.innerHTML = renderToString(<DateSlot {...PROPS} />);
    document.body.append(container);
    const slot = container.querySelector<HTMLElement>(`#${PROPS.id}`);
    expect(slot).toHaveTextContent(PROPS.placeholder);
    expect(slot).toHaveAttribute("data-pending");

    // The parser runs the script that follows the slot, before first paint.
    runScript(container.querySelector("script")?.textContent ?? "");
    expect(slot).toHaveTextContent("Daily #42 · Sunday 1 November");
    expect(slot).not.toHaveAttribute("data-pending");

    const errors = vi.spyOn(console, "error");
    await act(async () => {
      hydrateRoot(container, <DateSlot {...PROPS} />);
      await Promise.resolve();
    });
    expect(errors).not.toHaveBeenCalled();
    expect(slot).toHaveTextContent("Daily #42 · Sunday 1 November");
    expect(slot).not.toHaveAttribute("data-pending");
  });

  it("renders the date at once on a client navigation, where no script runs", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 2, 8));
    const container = document.createElement("div");
    document.body.append(container);
    // A fresh client render (no hydration) uses the device's date directly.
    act(() => {
      void import("react-dom/client").then(({ createRoot }) => {
        createRoot(container).render(<DateSlot {...PROPS} />);
      });
    });
    return vi.waitFor(() => {
      expect(container.querySelector(`#${PROPS.id}`)).toHaveTextContent(
        "Daily #43 · Monday 2 November",
      );
    });
  });

  it("keeps any value out of the script tag", () => {
    expect(
      dateSlotScript({ ...PROPS, template: "</script><b>{n}" }),
    ).not.toContain("</script>");
  });
});
