// Measures every colour pairing in tokens.js with the WCAG 2.2 formula, plus the feedback pairs
// under simulated colour-vision deficiency (Machado, Oliveira and Fernandes 2009, full severity,
// in linear RGB; difference reported as CIE76 delta E).
//   node contrast.js            prints Markdown tables (pasted into DESIGN.md)
//   node contrast.js --check    exits 1 if any pair misses its target
'use strict';
const T = require('./tokens.js');

const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unlin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const lum = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const MATS = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const clamp = (x) => Math.min(1, Math.max(0, x));
const sim = (h, k) => {
  if (k === 'normal') return h;
  const v = hex(h).map(lin);
  return '#' + MATS[k].map((r) => clamp(r[0] * v[0] + r[1] * v[1] + r[2] * v[2])).map((c) => Math.round(unlin(c) * 255).toString(16).padStart(2, '0')).join('');
};
const lab = (h) => {
  const [r, g, b] = hex(h).map(lin);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

const themes = [
  ['Light', T.light],
  ['Dark', T.dark],
];
const FEEDBACK = new Set(['correct', 'on-correct', 'correct-line', 'correct-text', 'correct-tint', 'incorrect', 'on-incorrect', 'incorrect-line', 'incorrect-text', 'incorrect-tint', 'play-accent', 'on-play-accent', 'play-accent-text', 'chart-you', 'chart-you-line']);
const hcThemes = [
  ['Light, high-contrast feedback', { ...T.light, ...T.hcLight }],
  ['Dark, high-contrast feedback', { ...T.dark, ...T.hcDark }],
];

let fails = 0;
const out = [];
function table(title, tokens, pairs) {
  out.push(`#### ${title}\n`, '| Foreground | Background | Ratio | Target | Pass | Used for |', '|---|---|---|---|---|---|');
  for (const [fg, bg, target, use] of pairs) {
    const r = ratio(tokens[fg], tokens[bg]);
    const ok = r >= target;
    if (!ok) fails++;
    out.push(`| \`${fg}\` ${tokens[fg]} | \`${bg}\` ${tokens[bg]} | ${r.toFixed(2)}:1 | ${target}:1 | ${ok ? 'Yes' : '**No**'} | ${use} |`);
  }
  out.push('');
}
for (const [name, tokens] of themes) table(name, tokens, T.PAIRS);
const hcPairs = T.PAIRS.filter(([fg, bg]) => FEEDBACK.has(fg) || FEEDBACK.has(bg));
for (const [name, tokens] of hcThemes) table(name, tokens, hcPairs);

out.push('#### Feedback colours under simulated colour-vision deficiency\n', 'Luminance ratio / CIE76 delta E. A delta E above about 10 is easy to see; luminance is what survives greyscale.\n', '| Theme | Pair | Normal | Protan | Deutan | Tritan |', '|---|---|---|---|---|---|');
for (const [name, tokens] of [...themes, ...hcThemes]) {
  for (const [a, b, use] of T.CVD_PAIRS) {
    const cells = ['normal', 'protan', 'deutan', 'tritan'].map((k) => {
      const x = sim(tokens[a], k), y = sim(tokens[b], k);
      return `${ratio(x, y).toFixed(2)} / ${dE(x, y).toFixed(0)}`;
    });
    out.push(`| ${name} | ${use} (\`${a}\` vs \`${b}\`) | ${cells.join(' | ')} |`);
  }
}
out.push('');

if (process.argv.includes('--check')) {
  console.log(fails ? `${fails} pair(s) miss their target` : `All ${(T.PAIRS.length * 2) + (hcPairs.length * 2)} pairs pass`);
  process.exit(fails ? 1 : 0);
} else {
  console.log(out.join('\n'));
  console.error(fails ? `${fails} pair(s) miss their target` : 'All pairs pass');
}

module.exports = { ratio, sim, dE, lum };
