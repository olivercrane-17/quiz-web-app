import { afterEach, describe, expect, it } from "vitest";

import { bootClient, resetBootForTests } from "./boot";

afterEach(() => {
  resetBootForTests();
  localStorage.clear();
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
});
