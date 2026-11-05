/**
 * The display settings on `<html>` (ARCHITECTURE §6.2, §10.3; DESIGN §13):
 * the stored theme, Reduce motion, Readable text and High-contrast
 * feedback become four attributes that the tokens in `globals.css` read.
 *
 *   theme "light" | "dark"   -> data-theme="light" | "dark" (absent: follow the system)
 *   motion "on"              -> data-motion="reduce" (Reduce motion: On)
 *   motion "off"             -> data-motion="full"   (Off: even if the OS asks for less)
 *   readableText             -> data-readable="on"
 *   highContrast             -> data-contrast="on"
 *
 * Three writers, one rule:
 * - `bootScript()` is the inline script the root layout puts in `<head>`.
 *   It runs while the HTML parses, before first paint, so a stored dark
 *   theme is dark from the first frame, the browser's chrome included.
 *   Under 600 bytes in the builds that ship (mock builds add the device
 *   lookup), and it never throws.
 * - `applyDisplaySettings()` does the same from code: the root layout's
 *   sync component calls it after React's development remount (which
 *   resets `<html>` attributes), when another tab changes the settings and
 *   when a navigation re-renders the theme-colour metas; the settings page
 *   calls it when the player changes one (SET-1).
 * - `readDisplaySettings()` reads `qz:settings` the way the script does,
 *   field by field like `decodeSettings` (./store), so all three agree
 *   with the store. The unit tests run the script against the same cases.
 *
 * Mock builds honour a test's device namespace (`window.__QZ_DEVICE__`,
 * `qz:d:<device>:settings`), as the kv layer does; Supabase builds never
 * read it. No imports beyond types, so the client chunk stays tiny.
 */
import type { Settings } from "./store";

export type DisplaySettings = Pick<
  Settings,
  "theme" | "motion" | "readableText" | "highContrast"
>;

export const DISPLAY_DEFAULTS: Readonly<DisplaySettings> = Object.freeze({
  theme: "system",
  motion: "system",
  readableText: false,
  highContrast: false,
});

export const DISPLAY_ATTRIBUTES = [
  "data-theme",
  "data-motion",
  "data-readable",
  "data-contrast",
] as const;
export type DisplayAttribute = (typeof DISPLAY_ATTRIBUTES)[number];

/** The page colour of each theme, for the browser's chrome (DESIGN §12.43). */
export const THEME_COLORS = { light: "#f5efe4", dark: "#1a1714" } as const;

/** Each attribute's value for these settings; null means absent. */
export function displayAttributes(
  settings: DisplaySettings,
): Record<DisplayAttribute, string | null> {
  return {
    "data-theme": settings.theme === "system" ? null : settings.theme,
    "data-motion":
      settings.motion === "on"
        ? "reduce"
        : settings.motion === "off"
          ? "full"
          : null,
    "data-readable": settings.readableText ? "on" : null,
    "data-contrast": settings.highContrast ? "on" : null,
  };
}

/**
 * The `media` a theme-colour meta needs so the browser's chrome matches
 * the page: its own scheme while the page follows the system, otherwise
 * `all` for the meta that carries the chosen theme's colour and `not all`
 * for the other. Switching `media`, never `content`, matters: React finds
 * the metas it rendered by their `content` when it hydrates or remounts
 * them, so a changed colour would leave a duplicate meta behind.
 */
export function themeColorMedia(
  content: string,
  theme: DisplaySettings["theme"],
): string {
  const paints = content === THEME_COLORS.dark ? "dark" : "light";
  if (theme === "system") return `(prefers-color-scheme: ${paints})`;
  return theme === paints ? "all" : "not all";
}

/**
 * Sets the four attributes on `root` (the document's `<html>` by default)
 * and points the theme-colour metas at a forced theme, so the browser's
 * chrome matches the page. A no-op without a DOM.
 */
export function applyDisplaySettings(
  settings: DisplaySettings,
  root?: HTMLElement,
): void {
  if (typeof document === "undefined") return;
  const element = root ?? document.documentElement;
  const attributes = displayAttributes(settings);
  for (const name of DISPLAY_ATTRIBUTES) {
    const value = attributes[name];
    if (value === null) element.removeAttribute(name);
    else if (element.getAttribute(name) !== value)
      element.setAttribute(name, value);
  }
  // The attribute, not the `media` property, which not every engine has.
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    const media = themeColorMedia(meta.content, settings.theme);
    if (meta.getAttribute("media") !== media) meta.setAttribute("media", media);
  }
}

/** The kv layer's device names (src/platform/storage/kv.ts). */
const DEVICE_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** The settings key for a device namespace: `qz:settings` or `qz:d:<device>:settings`. */
export function settingsKeyFor(device: unknown): string {
  return typeof device === "string" && DEVICE_NAME.test(device)
    ? `qz:d:${device}:settings`
    : "qz:settings";
}

/** The device a mock-build test asked for, read where the kv layer reads it. */
export function requestedDevice(): unknown {
  return (globalThis as { __QZ_DEVICE__?: unknown }).__QZ_DEVICE__;
}

/**
 * The display settings in a stored settings value, field by field: a value
 * that isn't one of a field's options gives that field its default, and a
 * value that isn't a settings object (or comes from an unknown version)
 * gives the defaults, exactly as `decodeSettings` does.
 */
export function displaySettingsFrom(raw: unknown): DisplaySettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DISPLAY_DEFAULTS };
  }
  const record = raw as Record<string, unknown>;
  if (record.v !== undefined && record.v !== 1) return { ...DISPLAY_DEFAULTS };
  const { theme, motion, readableText, highContrast } = record;
  return {
    theme: theme === "light" || theme === "dark" ? theme : "system",
    motion: motion === "on" || motion === "off" ? motion : "system",
    readableText: readableText === true,
    highContrast: highContrast === true,
  };
}

/** The slice of the Web Storage API this reads. */
export interface SettingsSource {
  getItem(key: string): string | null;
}

/** The stored display settings; the defaults when storage is missing, blocked or unreadable. */
export function readDisplaySettings(
  storage: SettingsSource | null,
  key: string,
): DisplaySettings {
  try {
    const text = storage?.getItem(key) ?? null;
    return displaySettingsFrom(text === null ? null : JSON.parse(text));
  } catch {
    return { ...DISPLAY_DEFAULTS };
  }
}

/** localStorage, or null where reading it throws (some private windows). */
export function browserStorage(): SettingsSource | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * The inline boot script. `devices` (mock builds only) makes it read the
 * device namespace a test set on `window.__QZ_DEVICE__` before load. It
 * only ever adds attributes: the prerendered `<html>` has none. A chosen
 * theme also switches the theme-colour metas, which Next puts before the
 * script in `<head>`, as `themeColorMedia` does (their `media` attribute,
 * never their `content`), so the browser's chrome matches from first paint
 * too, not only once `applyDisplaySettings` runs after hydration. `a`
 * names `setAttribute` once, to stay under 600 bytes.
 */
export function bootScript({ devices }: { devices: boolean }): string {
  const key = devices
    ? `var d=window.__QZ_DEVICE__,k=typeof d=="string"&&${DEVICE_NAME.toString()}.test(d)?"qz:d:"+d+":settings":"qz:settings";`
    : `var k="qz:settings";`;
  return (
    `(function(){try{${key}` +
    `var r=document.documentElement,a="setAttribute",s=JSON.parse(localStorage.getItem(k));` +
    `if(!s||typeof s!="object"||s.v!==void 0&&s.v!==1)return;` +
    `var t=s.theme,m=s.motion;` +
    `if(t=="light"||t=="dark"){r[a]("data-theme",t);` +
    `for(var q=document.getElementsByName("theme-color"),i=q.length,x=t=="dark";i--;)` +
    `q[i][a]("media",(q[i].content=="${THEME_COLORS.dark}")==x?"all":"not all")}` +
    `if(m=="on"||m=="off")r[a]("data-motion",m=="on"?"reduce":"full");` +
    `if(s.readableText===true)r[a]("data-readable","on");` +
    `if(s.highContrast===true)r[a]("data-contrast","on")` +
    `}catch(e){}})()`
  );
}
