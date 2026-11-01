import { afterEach, describe, expect, it } from "vitest";

import { getBackend, resetBackendForTests } from "@/backend";
import type { MockBackend } from "@/backend/mock";

import { bootClient, resetBootForTests } from "./boot";

afterEach(() => {
  resetBootForTests();
  resetBackendForTests();
  localStorage.clear();
  delete (window as { __qzMock?: unknown }).__qzMock;
});

describe("bootClient", () => {
  it("migrates storage before anything reads it, once per tab", async () => {
    localStorage.setItem("qz:history", "not json{");
    const first = bootClient();
    expect(bootClient()).toBe(first);
    await first;
    expect(JSON.parse(localStorage.getItem("qz:meta") ?? "null")).toMatchObject(
      { storageVersion: 1 },
    );
    expect(localStorage.getItem("qz:history")).toBeNull();
    expect(localStorage.getItem("qz:quarantine:history")).toBe("not json{");
  });

  it("loads or mints the identity and hands it to the backend (§9.1)", async () => {
    await bootClient();
    const stored = JSON.parse(localStorage.getItem("qz:identity") ?? "null");
    expect(stored).toMatchObject({ v: 1, registered: false, source: "minted" });
    const backend = (await getBackend()) as MockBackend;
    expect(backend.context.identity().current()).toEqual(stored);

    // The next tab finds the same identity rather than minting another.
    resetBootForTests();
    resetBackendForTests();
    await bootClient();
    const again = (await getBackend()) as MockBackend;
    expect(again.context.identity().current().playerId).toBe(stored.playerId);
  });
});
