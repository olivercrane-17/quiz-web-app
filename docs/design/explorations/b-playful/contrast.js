// Measures WCAG 2.2 contrast for the token pairs the design relies on.
// Reads the light (:root) and dark ([data-theme="dark"]) blocks from styles.css,
// so the numbers in brief.md always match the shipped values.
// Also simulates protanopia and deuteranopia (Machado, Oliveira and Fernandes 2009, severity 1.0).
// Usage: node contrast.js            (markdown tables)
//        node contrast.js --json     (raw numbers)
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
function block(selectorStart) {
  const i = css.indexOf(selectorStart);
  if (i < 0) throw new Error('block not found: ' + selectorStart);
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  const vars = {};
  for (const m of css.slice(open + 1, close).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) vars[m[1]] = m[2].toLowerCase();
  return vars;
}
const themes = {
  light: block(':root,\n[data-theme="light"]'),
  dark: block('[data-theme="dark"] {'),
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ratioLin = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const toLin = (h) => hex(h).map(lin);
const M = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};
const sim = (rgb, m) => m.map((row) => Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])));
const ratio = (a, b, mode) => {
  let x = toLin(a), y = toLin(b);
  if (mode) { x = sim(x, M[mode]); y = sim(y, M[mode]); }
  return ratioLin(x, y);
};

// Perceptual distance in OKLab (Ottosson 2020). Roughly: under 0.05 hard to tell apart, over 0.1 clearly different.
const oklab = ([r, g, b]) => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const dE = (a, b, mode) => {
  let x = toLin(a), y = toLin(b);
  if (mode) { x = sim(x, M[mode]); y = sim(y, M[mode]); }
  const p = oklab(x), q = oklab(y);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

// [label, foreground token, background token, minimum]
const TEXT = 4.5, UI = 3;
const pairs = [
  ['Body text on page', 'ink', 'paper', TEXT],
  ['Body text on card', 'ink', 'surface', TEXT],
  ['Secondary text on page', 'ink-2', 'paper', TEXT],
  ['Secondary text on card', 'ink-2', 'surface', TEXT],
  ['Dimmed answer / used clue text', 'ink-2', 'well', TEXT],
  ['Tertiary text on card', 'ink-3', 'surface', TEXT],
  ['Tertiary text on page', 'ink-3', 'paper', TEXT],
  ['Link on page', 'grape-text', 'paper', TEXT],
  ['Link on card', 'grape-text', 'surface', TEXT],
  ['Link on "wrong" sheet', 'grape-text', 'tomato-tint', TEXT],
  ['Link on "right" sheet', 'grape-text', 'leaf-tint', TEXT],
  ['Primary button label', 'on-grape', 'grape', TEXT],
  ['Label on sun (Daily CTA, stickers)', 'on-color', 'sun', TEXT],
  ['Label on gum (Mystery 2, worth chip)', 'on-color', 'gum', TEXT],
  ['Label on sky (Encore)', 'on-color', 'sky', TEXT],
  ['Answer text on correct fill', 'on-color', 'leaf', TEXT],
  ['Answer text on incorrect fill', 'on-color', 'tomato', TEXT],
  ['Number on flame (streak)', 'on-color', 'flame', TEXT],
  ['Number on grape-soft (Mystery 3 on hero)', 'on-color', 'grape-soft', TEXT],
  ['Verdict on "wrong" sheet', 'tomato-ink', 'tomato-tint', TEXT],
  ['Explanation on "wrong" sheet', 'ink', 'tomato-tint', TEXT],
  ['Verdict on "right" sheet', 'leaf-ink', 'leaf-tint', TEXT],
  ['Wrong-guess chip', 'tomato-ink', 'tomato-tint', TEXT],
  ['Highlighted suggestion', 'ink', 'grape-tint', TEXT],
  ['Category chip', 'ink', 'sky-tint', TEXT],
  ['High-contrast mode: text on correct (blue)', 'on-color', 'hc-correct', TEXT],
  ['High-contrast mode: text on incorrect (orange)', 'on-color', 'hc-incorrect', TEXT],
  ['Outline vs page', 'outline', 'paper', UI],
  ['Outline vs card', 'outline', 'surface', UI],
  ['Outline vs well', 'outline', 'well', UI],
  ['Focus ring / focused field vs page', 'ring', 'paper', UI],
  ['Focus ring / focused field vs card', 'ring', 'surface', UI],
  ['Highlighted suggestion ring vs its tint', 'ring', 'grape-tint', UI],
  ['Primary button fill vs page', 'grape', 'paper', UI],
  ['Correct fill vs its outline', 'leaf', 'outline-on-color', UI],
  ['Incorrect fill vs its outline', 'tomato', 'outline-on-color', UI],
  ['Mystery 1 shape vs its outline', 'sun', 'outline-on-color', UI],
  ['Mystery 2 shape vs its outline', 'gum', 'outline-on-color', UI],
  ['Encore shape vs its outline', 'sky', 'outline-on-color', UI],
  ['Streak flame vs its outline', 'flame', 'outline-on-color', UI],
];

const out = {};
for (const [name, t] of Object.entries(themes)) {
  out[name] = pairs.map(([label, fg, bg, min]) => {
    if (!t[fg] || !t[bg]) throw new Error(`${name}: missing token ${fg} or ${bg}`);
    const r = ratio(t[fg], t[bg]);
    return { label, fg: `${fg} ${t[fg]}`, bg: `${bg} ${t[bg]}`, ratio: +r.toFixed(2), min, pass: r >= min,
      protan: +ratio(t[fg], t[bg], 'protan').toFixed(2), deutan: +ratio(t[fg], t[bg], 'deutan').toFixed(2) };
  });
  // Informational: a state fill never touches the card directly (its outline sits between).
  out[name + '_fill_vs_card'] = { correct: +ratio(t.leaf, t.surface).toFixed(2), incorrect: +ratio(t.tomato, t.surface).toFixed(2) };
  // correct vs incorrect: reported, never relied on (icons and words carry the difference)
  out[name + '_dE'] = {
    standard: ['normal', 'protan', 'deutan'].map((m) => +dE(t.leaf, t.tomato, m === 'normal' ? null : m).toFixed(3)),
    highContrast: ['normal', 'protan', 'deutan'].map((m) => +dE(t['hc-correct'], t['hc-incorrect'], m === 'normal' ? null : m).toFixed(3)),
  };
  out[name + '_hc_pair'] = {
    normal: +ratio(t['hc-correct'], t['hc-incorrect']).toFixed(2),
    protan: +ratio(t['hc-correct'], t['hc-incorrect'], 'protan').toFixed(2),
    deutan: +ratio(t['hc-correct'], t['hc-incorrect'], 'deutan').toFixed(2),
  };
  out[name + '_pair'] = {
    normal: +ratio(t.leaf, t.tomato).toFixed(2),
    protan: +ratio(t.leaf, t.tomato, 'protan').toFixed(2),
    deutan: +ratio(t.leaf, t.tomato, 'deutan').toFixed(2),
  };
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  for (const name of Object.keys(themes)) {
    console.log(`\n#### ${name === 'light' ? 'Light' : 'Dark'} theme\n`);
    console.log('| Pair | Foreground | Background | Ratio | Needs | Protan | Deutan |');
    console.log('|---|---|---|---|---|---|---|');
    for (const r of out[name]) {
      console.log(`| ${r.label} | \`${r.fg}\` | \`${r.bg}\` | **${r.ratio}:1**${r.pass ? '' : ' FAIL'} | ${r.min}:1 | ${r.protan} | ${r.deutan} |`);
    }
    const p = out[name + '_pair'];
    console.log(`\nCorrect fill vs incorrect fill: ${p.normal}:1 (protan ${p.protan}, deutan ${p.deutan}).`);
    const hc = out[name + '_hc_pair'];
    console.log(`High-contrast blue vs orange: ${hc.normal}:1 (protan ${hc.protan}, deutan ${hc.deutan}).`);
    const d = out[name + '_dE'];
    console.log(`OKLab distance, correct vs incorrect fill (normal / protan / deutan): standard ${d.standard.join(' / ')}; high-contrast ${d.highContrast.join(' / ')}.`);
    const c = out[name + '_fill_vs_card'];
    console.log(`State fill straight onto the card (never adjacent, the outline sits between): correct ${c.correct}:1, incorrect ${c.incorrect}:1.`);
  }
  const fails = Object.keys(themes).flatMap((n) => out[n].filter((r) => !r.pass).map((r) => `${n}: ${r.label} ${r.ratio}`));
  console.log(fails.length ? `\nFAILURES:\n${fails.join('\n')}` : '\nAll pairs pass.');
}
