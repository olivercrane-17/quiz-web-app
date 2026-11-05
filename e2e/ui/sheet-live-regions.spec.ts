/**
 * Why a modal Sheet carries its own live regions (src/ui/sheet.tsx,
 * src/ui/announce.ts, WCAG 4.1.3): `showModal()` makes everything outside
 * the dialog inert, so Chromium drops the page's `role="status"` region
 * from the accessibility tree, and nothing written there is spoken. A
 * region inside the dialog stays. The unit tests check that announce()
 * writes into the open sheet's region; this checks the browser half
 * through the accessibility tree that screen readers read.
 *
 * Tagged @cdp: it reads that tree through Chromium's DevTools protocol,
 * which WebKit and Firefox don't speak, so playwright.config.ts runs it in
 * the Chromium projects only.
 */
import type { CDPSession, Page } from "@playwright/test";

import { expect, test } from "../fixtures";

/** The accessibility node of the first element matching `selector`. */
async function axNode(cdp: CDPSession, selector: string) {
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector,
  });
  expect(nodeId, `no element for ${selector}`).not.toBe(0);
  const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
    nodeId,
    fetchRelatives: false,
  });
  const node = nodes[0];
  if (node === undefined) throw new Error(`no AX node for ${selector}`);
  return node;
}

/** A dialog shaped like ModalSheet's, opened the way it opens one. */
async function openModalSheet(page: Page): Promise<void> {
  await page.evaluate(() => {
    const dialog = document.createElement("dialog");
    dialog.dataset.sheet = "modal";
    dialog.setAttribute("aria-label", "Report a problem");
    dialog.innerHTML =
      '<button type="button">Send report</button>' +
      '<div data-qz-live="polite" role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>';
    document.body.append(dialog);
    dialog.showModal();
    const outer = document.getElementById("qz-live-polite");
    const inner = dialog.querySelector('[data-qz-live="polite"]');
    if (outer === null || inner === null) throw new Error("missing regions");
    outer.textContent = "Page message";
    inner.textContent = "Sheet message";
  });
}

test(
  "a modal sheet hides the page's live region from screen readers, but not its own",
  { tag: "@cdp" },
  async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#qz-live-polite")).toBeAttached();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("Accessibility.enable");

    const before = await axNode(cdp, "#qz-live-polite");
    expect(before.ignored).toBe(false);
    expect(before.role?.value).toBe("status");

    await openModalSheet(page);

    const pageRegion = await axNode(cdp, "#qz-live-polite");
    expect(pageRegion.ignored).toBe(true);
    expect(pageRegion.ignoredReasons?.map((reason) => reason.name)).toContain(
      "activeModalDialog",
    );

    const sheetRegion = await axNode(cdp, 'dialog [data-qz-live="polite"]');
    expect(sheetRegion.ignored).toBe(false);
    expect(sheetRegion.role?.value).toBe("status");
  },
);
