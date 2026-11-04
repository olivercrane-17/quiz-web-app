import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DISPLAY_ATTRIBUTES } from "@/platform/settings/boot";

import { DisplaySettingsSync } from "./display-settings-sync";

const html = () => document.documentElement;

afterEach(() => {
  for (const name of DISPLAY_ATTRIBUTES) html().removeAttribute(name);
  localStorage.clear();
  delete (window as { __QZ_DEVICE__?: unknown }).__QZ_DEVICE__;
});

describe("DisplaySettingsSync", () => {
  it("puts the stored settings back after React resets <html>, as its development remount does", () => {
    localStorage.setItem(
      "qz:settings",
      '{"v":1,"theme":"dark","highContrast":true}',
    );
    const view = render(<DisplaySettingsSync devices={false} />);
    expect(html()).toHaveAttribute("data-theme", "dark");
    expect(html()).toHaveAttribute("data-contrast", "on");

    // React's remount leaves only the attributes it manages.
    for (const name of DISPLAY_ATTRIBUTES) html().removeAttribute(name);
    view.unmount();
    render(<DisplaySettingsSync devices={false} />);
    expect(html()).toHaveAttribute("data-theme", "dark");
    expect(html()).toHaveAttribute("data-contrast", "on");
  });

  it("follows another tab that saves new settings", () => {
    localStorage.setItem("qz:settings", '{"v":1,"theme":"dark"}');
    render(<DisplaySettingsSync devices={false} />);
    expect(html()).toHaveAttribute("data-theme", "dark");

    localStorage.setItem(
      "qz:settings",
      '{"v":1,"theme":"system","motion":"on","readableText":true}',
    );
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "qz:settings" }));
    });
    expect(html()).not.toHaveAttribute("data-theme");
    expect(html()).toHaveAttribute("data-motion", "reduce");
    expect(html()).toHaveAttribute("data-readable", "on");

    // Another key changing leaves the attributes alone.
    localStorage.setItem("qz:settings", '{"v":1,"theme":"light"}');
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "qz:history" }));
    });
    expect(html()).not.toHaveAttribute("data-theme");
  });

  it("reads a test's device namespace in mock builds", () => {
    localStorage.setItem("qz:d:phone-2:settings", '{"v":1,"theme":"light"}');
    (window as { __QZ_DEVICE__?: unknown }).__QZ_DEVICE__ = "phone-2";
    render(<DisplaySettingsSync devices />);
    expect(html()).toHaveAttribute("data-theme", "light");
  });

  it("renders nothing", () => {
    const { container } = render(<DisplaySettingsSync devices={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
