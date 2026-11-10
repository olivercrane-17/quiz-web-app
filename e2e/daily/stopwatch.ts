/**
 * The Daily's stopwatch from a spec: its reading, and a press made in the
 * same task as the reading (RITE round 3, R3-01).
 */
import type { Page } from "@playwright/test";

/** The stopwatch's `m:ss`. */
export async function stopwatchText(page: Page): Promise<string> {
  const text = (await page.locator("[data-stopwatch]").textContent()) ?? "";
  const match = /(\d+:\d\d)\s*$/.exec(text);
  if (match === null) throw new Error(`no time on the stopwatch: "${text}"`);
  return match[1] ?? "";
}

/**
 * Reads the stopwatch and presses the button named `name` in one
 * page.evaluate, so nothing runs between the reading and the press (R3-01).
 * It waits for the stopwatch to turn a second first, then 250 ms more: a
 * stopwatch that ticks on its own seconds reads true for the next 750 ms,
 * so a timer that fires a few ms late can't make the reading stale. Round
 * 3's stopwatch ticked on the wall clock's seconds and could read up to a
 * second behind even then.
 */
export async function readAndPress(page: Page, name: string): Promise<string> {
  return page.evaluate(async (label) => {
    const watch = document.querySelector("[data-stopwatch]");
    if (watch === null) throw new Error("no stopwatch");
    const read = () =>
      /(\d+:\d\d)\s*$/.exec(watch.textContent ?? "")?.[1] ?? "";
    const before = read();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`the stopwatch stayed on ${before} for 3 s`));
      }, 3_000);
      const observer = new MutationObserver(() => {
        if (read() === before) return;
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      });
      observer.observe(watch, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (button === undefined) throw new Error(`no ${label} button`);
    const reading = read();
    button.click();
    return reading;
  }, name);
}
