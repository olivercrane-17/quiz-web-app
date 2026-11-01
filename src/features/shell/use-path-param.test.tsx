import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShellParam } from "./shell-param";

const navigation = vi.hoisted(() => ({ pathname: "/shell/group" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

afterEach(() => {
  navigation.pathname = "/shell/group";
});

function marker(container: HTMLElement): string | null {
  return (
    container
      .querySelector("[data-shell-param]")
      ?.getAttribute("data-shell-param") ?? null
  );
}

describe("usePathParam", () => {
  it("is empty in the prerender and fills in after hydration, without a mismatch", () => {
    // The prerender runs at the shell's own address.
    const html = renderToString(<ShellParam source="/g/:groupId" />);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    expect(marker(container)).toBe("");

    // The browser hydrates it at the rewritten address.
    navigation.pathname = "/g/aaaa1111";
    const errors = vi.spyOn(console, "error");
    render(<ShellParam source="/g/:groupId" />, { container, hydrate: true });
    expect(marker(container)).toBe("aaaa1111");
    expect(errors).not.toHaveBeenCalled();
    container.remove();
  });

  it("follows the address while the same island stays mounted", () => {
    navigation.pathname = "/g/aaaa1111";
    const { container, rerender } = render(<ShellParam source="/g/:groupId" />);
    expect(marker(container)).toBe("aaaa1111");

    // Next reuses the one /shell/group instance for the next id...
    navigation.pathname = "/g/bbbb2222";
    act(() => {
      rerender(<ShellParam source="/g/:groupId" />);
    });
    expect(marker(container)).toBe("bbbb2222");

    // ...and keeps it mounted while another tab shows.
    navigation.pathname = "/";
    act(() => {
      rerender(<ShellParam source="/g/:groupId" />);
    });
    expect(marker(container)).toBe("");
  });
});
