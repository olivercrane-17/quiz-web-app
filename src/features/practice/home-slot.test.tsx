import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PRACTICE_COPY } from "./copy";
import { PracticeHomeSlot } from "./home-slot";
import { PRACTICE_INTENT_KEY } from "./intent";

/** What `./open-run` answers: the open run's label, or null. */
const openRun = vi.hoisted(() => ({ label: null as string | null }));
vi.mock("./open-run", () => ({
  openRunLabel: () => Promise.resolve(openRun.label),
}));

/** Lets the island's lazy chunk and its answer arrive. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

afterEach(() => {
  sessionStorage.clear();
  openRun.label = null;
});

/** Words that promise offline play the build can't keep yet. */
const OFFLINE_PROMISE = /offline/i;

describe("Today's Practice card", () => {
  it("R1-15 is a titled card with Quick play linking to the run, and promises nothing about offline play", async () => {
    render(<PracticeHomeSlot placement="regular" />);
    await settle();
    const card = screen.getByRole("region", { name: "Practice" });
    expect(card).toHaveTextContent("Ten questions on anything.");
    expect(card.textContent).not.toMatch(OFFLINE_PROMISE);
    const link = within(card).getByRole("link", { name: "Quick play" });
    expect(link).toHaveAttribute("href", "/practice/run");
  });

  it("R1-15 says nothing about offline play while no service worker proves it, here or on the way to a run", () => {
    // No build registers a service worker before PWA-1.
    expect("serviceWorker" in navigator).toBe(false);
    for (const line of [
      PRACTICE_COPY.card.line,
      PRACTICE_COPY.hub.quickPlayLine,
      PRACTICE_COPY.hub.later,
      PRACTICE_COPY.meta.hubDescription,
      PRACTICE_COPY.results.none.body,
      PRACTICE_COPY.run.failed.body,
      PRACTICE_COPY.run.offline.body,
    ]) {
      expect(line).not.toMatch(OFFLINE_PROMISE);
    }
  });

  it("keeps each copy's title id apart, since Today renders the card twice", async () => {
    render(
      <>
        <PracticeHomeSlot placement="promoted" />
        <PracticeHomeSlot placement="regular" />
      </>,
    );
    await settle();
    const ids = screen
      .getAllByRole("region", { name: "Practice" })
      .map((card) => card.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
  });

  it("leaves the Quick play request for the run screen on a plain click", async () => {
    render(<PracticeHomeSlot placement="regular" />);
    await settle();
    const link = screen.getByRole("link", { name: "Quick play" });
    // Stop the navigation itself; only the request matters here.
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link, { button: 0 });
    expect(
      JSON.parse(sessionStorage.getItem(PRACTICE_INTENT_KEY) ?? "null"),
    ).toEqual({
      v: 1,
      mode: "quick",
      category: "mixed",
      difficulty: "mixed",
    });
  });

  it("leaves nothing behind when the link opens in a new tab or window", async () => {
    render(<PracticeHomeSlot placement="regular" />);
    await settle();
    const link = screen.getByRole("link", { name: "Quick play" });
    link.addEventListener("click", (event) => event.preventDefault());
    for (const modifier of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
    ]) {
      fireEvent.click(link, { button: 0, ...modifier });
    }
    expect(sessionStorage.getItem(PRACTICE_INTENT_KEY)).toBeNull();
  });

  it("R1-36 reads Continue practice · 3 of 10 while a run is open, and carries that run on", async () => {
    openRun.label = "Continue practice · 3 of 10";
    render(<PracticeHomeSlot placement="regular" />);
    // The server's label first, so hydration matches; the open run's next.
    expect(screen.getByRole("link", { name: "Quick play" })).toBeVisible();
    await settle();
    const link = screen.getByRole("link", {
      name: "Continue practice · 3 of 10",
    });
    expect(link).toHaveAttribute("href", "/practice/run");
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link, { button: 0 });
    // No request: the run screen resumes the open run instead of starting one.
    expect(sessionStorage.getItem(PRACTICE_INTENT_KEY)).toBeNull();
  });
});
