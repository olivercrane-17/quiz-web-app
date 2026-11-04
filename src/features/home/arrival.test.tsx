import { render } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeArrival } from "./arrival";

const router = vi.hoisted(() => ({ bfcacheId: "_b_1_" }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

let scrollTo: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  router.bfcacheId = "_b_1_";
  scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  scrollTo.mockRestore();
});

function Today({ shown }: { shown: boolean }) {
  // Next keeps a route it has left in a hidden Activity.
  return (
    <Activity mode={shown ? "visible" : "hidden"}>
      <HomeArrival />
    </Activity>
  );
}

describe("HomeArrival", () => {
  it("R1-35 scrolls to the top when a link or a tab opens Today", () => {
    render(<Today shown />);
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(0, 0);
  });

  it("R1-35 scrolls to the top again when a link brings back a hidden Today", () => {
    const { rerender } = render(<Today shown />);
    scrollTo.mockClear();
    rerender(<Today shown={false} />);
    // A push mints a new id.
    router.bfcacheId = "_b_2_";
    rerender(<Today shown />);
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(0, 0);
  });

  it("R1-35 leaves the scroll Back or Forward restores", () => {
    const { rerender } = render(<Today shown />);
    scrollTo.mockClear();
    rerender(<Today shown={false} />);
    // A traversal shows the same entry, with the same id.
    rerender(<Today shown />);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
