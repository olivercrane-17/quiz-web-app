/**
 * Accessibility checks (ARCHITECTURE §11.5, AC-A11Y-01): axe-core over the
 * page as it is now, against WCAG 2.0, 2.1 and 2.2 A and AA. Any serious or
 * critical violation fails the test, listed with the elements it found.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

const FAILING_IMPACTS = new Set(["serious", "critical"]);

/** Runs axe on `page` and fails on any serious or critical violation. */
export async function expectNoSeriousAxe(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags([...AXE_TAGS])
    .analyze();
  const failing = violations
    .filter((violation) => FAILING_IMPACTS.has(violation.impact ?? ""))
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 5)
        .map((node) => node.target.join(" "))
        .join(", ");
      const more =
        violation.nodes.length > 5
          ? ` and ${violation.nodes.length - 5} more`
          : "";
      return `${violation.impact} ${violation.id}: ${violation.help} (${targets}${more}) ${violation.helpUrl}`;
    });
  expect(failing, `serious or critical axe findings on ${page.url()}`).toEqual(
    [],
  );
}
