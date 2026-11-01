import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { firstShown, isShown } from "./shown";

/** jsdom lays nothing out and has no checkVisibility: hidden ancestors hide in this stand-in. */
function installCheckVisibility(): void {
  Object.defineProperty(Element.prototype, "checkVisibility", {
    configurable: true,
    value(this: Element) {
      return this.closest("[hidden]") === null;
    },
  });
}

function removeCheckVisibility(): void {
  delete (Element.prototype as { checkVisibility?: unknown }).checkVisibility;
}

afterEach(() => {
  removeCheckVisibility();
  document.body.replaceChildren();
});

describe("isShown and firstShown", () => {
  beforeEach(installCheckVisibility);

  it("skip copies inside a hidden route", () => {
    document.body.innerHTML =
      '<div hidden><main id="main">old</main></div><div><main id="main">current</main></div>';
    expect(firstShown("main#main")?.textContent).toBe("current");
    expect(isShown(document.querySelector("main") as Element)).toBe(false);
  });

  it("find nothing when every copy is hidden", () => {
    document.body.innerHTML = '<div hidden><main id="main"></main></div>';
    expect(firstShown("main#main")).toBeNull();
  });
});

describe("without checkVisibility", () => {
  it("falls back to the layout box (none in a DOM without layout)", () => {
    document.body.innerHTML = '<main id="main"></main>';
    expect(isShown(document.querySelector("main") as Element)).toBe(false);
  });
});
