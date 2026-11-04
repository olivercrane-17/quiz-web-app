"use client";

/**
 * Keeps `<html>`'s display attributes in step with the stored settings
 * (ARCHITECTURE §10.3). The inline boot script sets them before first
 * paint; this re-applies them:
 * - after React's development remount, which resets `<html>` to the
 *   attributes it manages (a no-op in production, where they are already
 *   right), in `useLayoutEffect`, so the page never paints without them;
 * - when another tab saves new settings (`storage` events), so every open
 *   tab follows the settings page.
 *
 * The settings page applies its own changes at once through
 * `applyDisplaySettings` (SET-1). Rendered once, by the root layout. It
 * renders nothing.
 */
import { useLayoutEffect } from "react";

import {
  applyDisplaySettings,
  browserStorage,
  readDisplaySettings,
  requestedDevice,
  settingsKeyFor,
} from "@/platform/settings/boot";

export function DisplaySettingsSync({
  devices,
}: {
  /** Mock builds: honour a test's device namespace, as the boot script does. */
  devices: boolean;
}) {
  useLayoutEffect(() => {
    const key = settingsKeyFor(devices ? requestedDevice() : null);
    const apply = () => {
      applyDisplaySettings(readDisplaySettings(browserStorage(), key));
    };
    apply();
    const onStorage = (event: StorageEvent) => {
      // A null key means storage was cleared.
      if (event.key === null || event.key === key) apply();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [devices]);
  return null;
}
