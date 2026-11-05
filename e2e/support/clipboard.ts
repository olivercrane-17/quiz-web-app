/**
 * The clipboard for Share specs, in every browser of the matrix
 * (ARCHITECTURE §11.8). Chromium takes the two clipboard permissions, so
 * `navigator.clipboard.readText()` reads what the app wrote. Firefox and
 * WebKit know no such permission names (`browser.newContext` refuses them)
 * and won't let a page read the system clipboard, so there the page gets
 * its own stand-in clipboard instead: `writeText` keeps the text and
 * resolves, `readText` returns it. A spec that makes `writeText` fail
 * overrides it on `Clipboard.prototype` after this, which still wins.
 */
import type { Page } from "@playwright/test";

export async function allowClipboard(
  page: Page,
  browserName: string,
): Promise<void> {
  if (browserName === "chromium") {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    return;
  }
  await page.addInitScript(() => {
    let held = "";
    const writeText = (text: string) => {
      held = String(text);
      return Promise.resolve();
    };
    const readText = () => Promise.resolve(held);
    if (typeof Clipboard === "function") {
      Object.defineProperty(Clipboard.prototype, "writeText", {
        configurable: true,
        writable: true,
        value: writeText,
      });
      Object.defineProperty(Clipboard.prototype, "readText", {
        configurable: true,
        writable: true,
        value: readText,
      });
    }
    if (navigator.clipboard === undefined) {
      Object.defineProperty(Navigator.prototype, "clipboard", {
        configurable: true,
        get: () => ({ writeText, readText }),
      });
    }
  });
}
