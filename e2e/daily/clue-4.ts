/**
 * A Mystery's options from a spec (D31, RITE round 4, R4-01): a tap, a
 * click or a key only chooses an option, and the Lock in button under the
 * options sends the one pick. Specs in any folder that play a Mystery out
 * on its options import these.
 */
import type { Locator, Page } from "@playwright/test";

/** The option buttons A to D, without the Lock in button under them. */
export function optionButtons(page: Page): Locator {
  return page.locator("[data-options] [data-option]").getByRole("button");
}

/** The Lock in button under the options: "Lock in", then "Lock in Cobalt". */
export function lockInButton(page: Page): Locator {
  return page.locator("[data-options] [data-lock-in]");
}

/** Chooses the option named `name`; nothing is sent. */
export async function chooseOption(
  page: Page,
  name: RegExp | string,
): Promise<void> {
  await optionButtons(page).filter({ hasText: name }).click();
}

/** Chooses the option named `name`, then locks it in: the round resolves, or the next clue opens. */
export async function pickOption(
  page: Page,
  name: RegExp | string,
): Promise<void> {
  await chooseOption(page, name);
  await lockInButton(page).click();
}

/** Chooses option A, then locks it in. */
export async function pickFirstOption(page: Page): Promise<void> {
  await optionButtons(page).first().click();
  await lockInButton(page).click();
}
