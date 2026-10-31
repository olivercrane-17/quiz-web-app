// Measures every color pairing the prototype uses, in both themes, with the WCAG 2.2 formula.
// Also simulates protanopia and deuteranopia (Machado, Oliveira and Fernandes 2009, severity 1.0)
// to check that state colors still clear 3:1 against their surfaces, and how far apart
// "correct" and "incorrect" stay (CIE76 delta E) when red-green vision is missing.
//
//   node contrast.js          prints Markdown tables (pasted into brief.md)
//   node contrast.js --check  exits 1 if any pair fails its target
const { color } = require('./tokens.js');

const hex2rgb = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b; // takes linear rgb
const ratioLin = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const lin = (hex) => hex2rgb(hex).map(toLin);

const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};
const simulate = (l, m) => m.map((row) => Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])));

// CIELAB (D65) for delta E between simulated colors
const lab = (l) => {
  const [r, g, b] = l;
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const toHex = (l) => '#' + l.map((c) => Math.round(toSrgb(c) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

// [foreground, background, target, where it is used]
const TEXT = 4.5, UI = 3;
const pairs = [
  ['text-1', 'bg-top', TEXT, 'Headings and labels on the sky (top of screen)'],
  ['text-1', 'bg-bottom', TEXT, 'Headings and labels on the sky (bottom of screen)'],
  ['text-1', 'surface-1', TEXT, 'Clue text, answers, card text'],
  ['text-1', 'surface-2', TEXT, 'Typed guess, chips'],
  ['text-1', 'surface-3', TEXT, 'Active suggestion, pressed answer'],
  ['text-1', 'sheet', TEXT, 'Explanation sheet'],
  ['text-2', 'bg-top', TEXT, 'Secondary text on the sky (top)'],
  ['text-2', 'bg-bottom', TEXT, 'Secondary text on the sky (bottom)'],
  ['text-2', 'surface-1', TEXT, 'Secondary text on cards, earlier clues'],
  ['text-2', 'surface-2', TEXT, 'Input label, chip text'],
  ['text-2', 'surface-3', TEXT, 'Secondary text on the active suggestion'],
  ['text-2', 'sheet', TEXT, 'Links row on the sheet'],
  ['text-dim', 'bg', TEXT, 'Dimmed answers after a reveal (they stay readable)'],
  ['text-dim', 'bg-bottom', TEXT, 'Dimmed answers, lowest point of the sky'],
  ['accent-text', 'surface-1', TEXT, 'Gold text on cards ("Worth 3", best-fact line)'],
  ['accent-text', 'bg-top', TEXT, 'Gold text on the sky'],
  ['accent-text', 'accent-tint', TEXT, 'Best-fact pill'],
  ['on-primary', 'primary', TEXT, 'Primary button label'],
  ['on-accent', 'accent', TEXT, 'Label on gold fills (night-window button, Guess pill)'],
  ['text-1', 'correct-fill', TEXT, 'Answer text on the correct answer'],
  ['text-1', 'incorrect-fill', TEXT, 'Answer text on a wrong pick'],
  ['text-1', 'selected-fill', TEXT, 'Answer text while locked in'],
  ['text-1', 'violet-tint', TEXT, 'Text on violet chips'],
  ['on-correct', 'correct', TEXT, '"Correct answer" pill and check badge'],
  ['on-incorrect', 'incorrect', TEXT, '"Your answer" pill and X badge'],
  ['link', 'sheet', TEXT, '"Learn more" link'],
  ['link', 'surface-1', TEXT, 'Links on cards'],
  ['warning', 'surface-1', TEXT, '"Checking..." and offline notes'],
  ['line-ui', 'surface-1', UI, 'Borders of inputs, secondary buttons and answers'],
  ['line-ui', 'surface-2', UI, 'Input border, unfocused'],
  ['line-ui', 'bg-bottom', UI, 'Answer borders on the sky'],
  ['primary', 'bg-bottom', UI, 'Primary button against the screen'],
  ['primary', 'sheet', UI, 'Primary button against the sheet'],
  ['focus', 'bg-top', UI, 'Focus ring on the sky'],
  ['focus', 'surface-1', UI, 'Focus ring on cards'],
  ['focus', 'sheet', UI, 'Focus ring on the sheet'],
  ['correct', 'bg-bottom', UI, 'Correct answer border against the sky'],
  ['correct', 'correct-fill', UI, 'Correct border against its own fill'],
  ['incorrect', 'bg-bottom', UI, 'Wrong-pick border against the sky'],
  ['incorrect', 'incorrect-fill', UI, 'Wrong-pick border against its own fill'],
  ['incorrect', 'surface-1', TEXT, 'Wrong-guess stamp text on a clue card'],
  ['selected', 'surface-1', UI, 'Lock-in border, focused input'],
  ['selected', 'surface-2', UI, 'Focused input border'],
  ['accent-strong', 'surface-1', UI, 'Solved-on square, current progress star'],
  ['violet', 'surface-1', UI, 'Used-clue square'],
  ['chart-dot', 'surface-1', UI, 'Distribution chart dots'],
  ['chart-you', 'surface-1', UI, 'Your column in the chart'],
  ['accent', 'night-1', UI, 'Gold button and stars in the night window'],
  ['line-ui', 'bg-top', UI, 'Progress segments and chips on the sky'],
  ['text-1', 'tabbar', TEXT, 'Current tab label'],
  ['text-2', 'tabbar', TEXT, 'Other tab labels'],
  // The night window is rendered with the Night palette in both themes, so these are checked once
  ['text-1', 'night-1', TEXT, 'Night window title (lightest corner)', 'dark'],
  ['text-1', 'night-2', TEXT, 'Night window title (violet corner)', 'dark'],
  ['text-2', 'night-1', TEXT, 'Night window labels and constellation names', 'dark'],
  ['text-2', 'night-2', TEXT, 'Night window labels, violet corner', 'dark'],
  ['accent-text', 'night-1', TEXT, '"Daily #42" in the night window', 'dark'],
  ['text-2', 'night-glow', TEXT, '"12,408 playing today" under the lamp glow (brightest point)', 'dark'],
  ['text-1', 'night-glow', TEXT, 'Title text if it ever reaches the glow', 'dark'],
  ['on-accent', 'accent', TEXT, 'Play the Daily (gold button in the night window)', 'dark'],
];

// State colors that must survive protan and deutan simulation (3:1 against the surface they sit on)
const cvdPairs = [
  ['correct', 'bg-bottom'], ['incorrect', 'bg-bottom'], ['correct', 'surface-1'], ['incorrect', 'surface-1'],
  ['selected', 'surface-1'], ['accent-strong', 'surface-1'], ['violet', 'surface-1'],
];

const fmt = (n) => n.toFixed(2);
let failures = 0;
const out = [];
for (const theme of ['light', 'dark']) {
  const t = color[theme];
  out.push(`\n#### ${theme === 'dark' ? 'Night (dark)' : 'Dawn (light)'}\n`);
  out.push('| Foreground | Background | Ratio | Target | Pass | Used for |');
  out.push('|---|---|---|---|---|---|');
  for (const [fg, bg, target, use, only] of pairs) {
    if (only && only !== theme) continue;
    const r = ratioLin(lin(t[fg]), lin(t[bg]));
    const pass = r >= target;
    if (!pass) failures++;
    out.push(`| \`${fg}\` ${t[fg]} | \`${bg}\` ${t[bg]} | ${fmt(r)}:1 | ${target}:1 | ${pass ? 'yes' : '**NO**'} | ${use} |`);
  }
  out.push('');
  out.push('| State color vs surface | Normal | Protan | Deutan | Pass (3:1 all) |');
  out.push('|---|---|---|---|---|');
  for (const [fg, bg] of cvdPairs) {
    const a = lin(t[fg]), b = lin(t[bg]);
    const n = ratioLin(a, b);
    const p = ratioLin(simulate(a, MACHADO.protan), simulate(b, MACHADO.protan));
    const d = ratioLin(simulate(a, MACHADO.deutan), simulate(b, MACHADO.deutan));
    const pass = Math.min(n, p, d) >= UI;
    if (!pass) failures++;
    out.push(`| \`${fg}\` on \`${bg}\` | ${fmt(n)} | ${fmt(p)} | ${fmt(d)} | ${pass ? 'yes' : '**NO**'} |`);
  }
  const c = lin(t.correct), i = lin(t.incorrect);
  const cf = lin(t['correct-fill']), inf = lin(t['incorrect-fill']);
  out.push('');
  out.push('| Correct vs incorrect | Normal | Protan | Deutan |');
  out.push('|---|---|---|---|');
  out.push(`| Borders and badges, delta E (CIE76) | ${dE(c, i).toFixed(0)} | ${dE(simulate(c, MACHADO.protan), simulate(i, MACHADO.protan)).toFixed(0)} | ${dE(simulate(c, MACHADO.deutan), simulate(i, MACHADO.deutan)).toFixed(0)} |`);
  out.push(`| Fills, delta E (CIE76) | ${dE(cf, inf).toFixed(0)} | ${dE(simulate(cf, MACHADO.protan), simulate(inf, MACHADO.protan)).toFixed(0)} | ${dE(simulate(cf, MACHADO.deutan), simulate(inf, MACHADO.deutan)).toFixed(0)} |`);
  out.push(`| Simulated borders | ${t.correct} / ${t.incorrect} | ${toHex(simulate(c, MACHADO.protan))} / ${toHex(simulate(i, MACHADO.protan))} | ${toHex(simulate(c, MACHADO.deutan))} / ${toHex(simulate(i, MACHADO.deutan))} |`);
}

// High-contrast feedback swap (blue and orange)
out.push('\n#### High-contrast feedback setting (blue and orange)\n');
out.push('| Theme | Pair | Ratio | Target | Pass |');
out.push('|---|---|---|---|---|');
for (const theme of ['light', 'dark']) {
  const base = color[theme], hc = { ...base, ...color.hcFeedback[theme] };
  for (const [fg, bg, target] of [['correct', 'bg-bottom', UI], ['incorrect', 'bg-bottom', UI], ['on-correct', 'correct', TEXT], ['on-incorrect', 'incorrect', TEXT], ['text-1', 'correct-fill', TEXT], ['text-1', 'incorrect-fill', TEXT], ['correct', 'correct-fill', UI], ['incorrect', 'incorrect-fill', UI]]) {
    const r = ratioLin(lin(hc[fg]), lin(hc[bg]));
    const pass = r >= target;
    if (!pass) failures++;
    out.push(`| ${theme} | \`${fg}\` ${hc[fg]} on \`${bg}\` ${hc[bg]} | ${fmt(r)}:1 | ${target}:1 | ${pass ? 'yes' : '**NO**'} |`);
  }
}

console.log(out.join('\n'));
console.log(`\n${failures === 0 ? 'All pairs pass.' : failures + ' failing pair(s).'}`);
if (process.argv.includes('--check') && failures) process.exit(1);
