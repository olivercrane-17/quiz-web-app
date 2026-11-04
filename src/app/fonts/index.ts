/**
 * The two families (DESIGN §3.1), self-hosted through `next/font/local`, so
 * no third-party font host is ever contacted (constraint 9).
 *
 * - **Fraunces** (display: headings, data numerals, the wordmark), SOFT 100
 *   and WONK 1 baked in, weights 500 to 800, plus one italic cut at 450 for
 *   the flourishes ("and an Encore", "No. 42", the italic E).
 * - **Atkinson Hyperlegible Next** (text: everything people read), weights
 *   400 to 800.
 *
 * Each family is one `font-family` name made of several files: the latin
 * files load on a typical page and the two roman ones are preloaded; the
 * latin-ext files load only when a page holds a character such as Ł or ř
 * (unicode-range), and the italic only when italic text renders. That is
 * why every face is its own `localFont()` call with the family named in
 * `declarations`: one call can't give its files different ranges. The
 * tokens in `globals.css` name the same families (`--kn-font-display`,
 * `--kn-font-text`), together with metric-matched fallbacks. The two roman
 * latin files go out as `Link: rel=preload` headers with every page.
 *
 * The files come from docs/design/final/fonts/ (built from the Fontsource
 * packages by `build-fonts.sh` there); both SIL Open Font License texts sit
 * beside them and belong on /credits (LGL-1).
 */
import localFont from "next/font/local";

// next/font reads these options at build time and accepts only literals, so
// the unicode ranges are written out in each call: Fontsource's latin subset
// (U+0000-00FF ...) and latin-ext subset (U+0100-02BA ...), as the prototype
// declares them.

export const frauncesRoman = localFont({
  src: "./fraunces-roman-latin.woff2",
  variable: "--kn-face-display",
  weight: "500 800",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Fraunces" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

export const frauncesRomanExt = localFont({
  src: "./fraunces-roman-latin-ext.woff2",
  variable: "--kn-face-display-ext",
  weight: "500 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Fraunces" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

export const frauncesItalic = localFont({
  src: "./fraunces-italic-latin.woff2",
  variable: "--kn-face-display-italic",
  weight: "400 500",
  style: "italic",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "Fraunces" }],
});

export const atkinson = localFont({
  src: "./atkinson-next-latin.woff2",
  variable: "--kn-face-text",
  weight: "400 800",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Atkinson Hyperlegible Next" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

export const atkinsonExt = localFont({
  src: "./atkinson-next-latin-ext.woff2",
  variable: "--kn-face-text-ext",
  weight: "400 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Atkinson Hyperlegible Next" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

/**
 * One class per face, which the root `<html>` carries. The variables they
 * declare go unused (the tokens name the families directly); the classes
 * tie every face's @font-face rule to the root layout, so none is dropped
 * from the build and next/font preloads the two roman files.
 */
export const FONT_VARIABLES = [
  frauncesRoman.variable,
  frauncesRomanExt.variable,
  frauncesItalic.variable,
  atkinson.variable,
  atkinsonExt.variable,
].join(" ");
