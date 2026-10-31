// Measures WCAG 2.x contrast for every token pairing the prototype uses, in both themes,
// and checks the correct/incorrect states under simulated colour-vision deficiency.
// Usage: node contrast.js            (prints Markdown tables)
//        node contrast.js --check    (exits 1 if any pair misses its target)
const tokens = require('./tokens.json');

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const luminance = (rgbLin) => 0.2126 * rgbLin[0] + 0.7152 * rgbLin[1] + 0.0722 * rgbLin[2];
const lin = (hex) => hexToRgb(hex).map(toLinear);
const ratioLin = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const ratio = (fg, bg) => ratioLin(lin(fg), lin(bg));

// Machado, Oliveira and Fernandes (2009), severity 1.0, applied to linear RGB.
// https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const simulate = (hex, m) => {
  const c = lin(hex);
  return m.map((row) => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])));
};
// CIE76 colour difference in Lab (D65), enough to show two fills stay apart.
const toLab = (rgbLin) => {
  const [r, g, b] = rgbLin;
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const deltaE = (a, b) => {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

// [foreground, background, minimum, what it is]
const TEXT = 4.5;
const UI = 3;
const pairs = [
  ['ink', 'paper', TEXT, 'Body text on the page'],
  ['ink', 'paper-raised', TEXT, 'Body text on cards and options'],
  ['ink', 'paper-sunken', TEXT, 'Text in wells and the keypad'],
  ['ink-2', 'paper', TEXT, 'Secondary text on the page'],
  ['ink-2', 'paper-raised', TEXT, 'Dimmed options and secondary text on cards'],
  ['ink-3', 'paper', TEXT, 'Meta text (dates, counts) on the page'],
  ['ink-3', 'paper-raised', TEXT, 'Meta text on cards'],
  ['paper-raised', 'ink', TEXT, 'Primary button label'],
  ['eft-ink', 'eft', TEXT, "Text on the Daily card and accent buttons"],
  ['eft-deep', 'paper', TEXT, 'Accent text (kickers, links) on the page'],
  ['eft-deep', 'paper-raised', TEXT, 'Accent text on cards'],
  ['ink', 'eft-tint', TEXT, 'Text on the highlighter wash'],
  ['pine-ink', 'pine', TEXT, 'Correct answer text on its fill'],
  ['pine-text', 'paper-raised', TEXT, '"Correct answer" label on cards'],
  ['ink', 'pine-tint', TEXT, 'Text on a solved clue'],
  ['ink', 'cranberry-tint', TEXT, 'Your wrong pick, text on its tint'],
  ['cranberry-text', 'paper-raised', TEXT, '"Your answer" label on cards'],
  ['cranberry-text', 'cranberry-tint', TEXT, '"Your answer" label on its tint'],
  ['amber-text', 'paper', TEXT, 'Warning text (rooms only)'],
  ['rule-strong', 'paper', UI, 'Input and option borders on the page'],
  ['rule-strong', 'paper-raised', UI, 'Option borders on cards'],
  ['focus', 'paper', UI, 'Focus ring on the page'],
  ['focus-on-accent', 'eft', UI, 'Focus ring on the Daily card'],
  ['selected', 'paper-raised', UI, 'Locked-in border before the reveal'],
  ['pine-line', 'paper-raised', UI, 'Correct border and solved square against a neighbour'],
  ['pine-line', 'paper', UI, 'Solved square on the page'],
  ['cranberry-line', 'paper-raised', UI, 'Wrong-pick border and used-clue square'],
  ['cranberry-line', 'cranberry-tint', UI, 'Wrong-pick border against its own fill'],
  ['cranberry-ink', 'cranberry', UI, 'X icon on the wrong badge'],
  ['pine-ink', 'pine', UI, 'Check icon on the correct badge'],
  ['eft', 'paper', UI, 'Accent fills (your bar, streak dots) on the page'],
  ['eft', 'paper-raised', UI, 'Accent fills on cards'],
  ['ink', 'paper-raised', UI, 'Chart bars and filled week dots'],
];

// The optional high-contrast feedback setting swaps green and red for blue and orange
const hcPairs = [
  ['hc-correct-ink', 'hc-correct', TEXT, 'Correct answer text on its blue fill'],
  ['hc-correct-line', 'paper-raised', UI, 'Correct border against a neighbour'],
  ['ink', 'hc-wrong-tint', TEXT, 'Wrong pick text on its orange tint'],
  ['hc-wrong-text', 'paper-raised', TEXT, '"Your answer" label'],
  ['hc-wrong-line', 'paper-raised', UI, 'Wrong border against a neighbour'],
  ['hc-wrong-line', 'hc-wrong-tint', UI, 'Wrong border against its own fill'],
  ['hc-wrong-ink', 'hc-wrong', UI, 'X icon on the wrong badge'],
];

const cvdPairs = [
  ['pine', 'cranberry-tint', 'Correct fill next to a wrong pick'],
  ['pine-line', 'cranberry-line', 'Solved square next to a used-clue square'],
  ['pine-line', 'paper-raised', 'Correct border against an untouched option'],
  ['cranberry-line', 'paper-raised', 'Wrong border against an untouched option'],
  ['eft', 'rule-strong', 'Your bar next to the other bars (it also gets an ink outline and a You label)'],
  ['eft-ink', 'eft', 'The ink outline on your bar'],
  ['hc-correct-line', 'hc-wrong-line', 'High-contrast setting: solved next to used'],
];

let failures = 0;
const out = [];
for (const theme of ['light', 'dark']) {
  const t = tokens[theme];
  out.push(`\n#### ${theme === 'light' ? 'Light' : 'Dark'} theme\n`);
  out.push('| Foreground | Background | Ratio | Target | Pass | Used for |');
  out.push('|---|---|---|---|---|---|');
  for (const [fg, bg, min, use] of pairs) {
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    out.push(`| \`${fg}\` ${t[fg]} | \`${bg}\` ${t[bg]} | ${r.toFixed(2)}:1 | ${min}:1 | ${ok ? 'Yes' : '**No**'} | ${use} |`);
  }
}

out.push('\n#### High-contrast feedback setting (blue and orange)\n');
out.push('| Theme | Foreground | Background | Ratio | Target | Pass | Used for |');
out.push('|---|---|---|---|---|---|---|');
for (const theme of ['light', 'dark']) {
  const t = tokens[theme];
  for (const [fg, bg, min, use] of hcPairs) {
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    out.push(`| ${theme} | \`${fg}\` ${t[fg]} | \`${bg}\` ${t[bg]} | ${r.toFixed(2)}:1 | ${min}:1 | ${ok ? 'Yes' : '**No**'} | ${use} |`);
  }
}
out.push('\n#### Feedback states under simulated colour-vision deficiency\n');
out.push('Luminance contrast (L) and CIE76 colour difference (ΔE) after Machado 2009 simulation at full severity. These are extra margin: every state also carries an icon, a word and a shape change.\n');
out.push('| Theme | Pair | Normal L / ΔE | Protan L / ΔE | Deutan L / ΔE | Tritan L / ΔE |');
out.push('|---|---|---|---|---|---|');
for (const theme of ['light', 'dark']) {
  const t = tokens[theme];
  for (const [a, b, label] of cvdPairs) {
    const cells = [['normal', null], ...Object.entries(CVD)].map(([name, m]) => {
      const la = m ? simulate(t[a], m) : lin(t[a]);
      const lb = m ? simulate(t[b], m) : lin(t[b]);
      return `${ratioLin(la, lb).toFixed(2)} / ${deltaE(la, lb).toFixed(0)}`;
    });
    out.push(`| ${theme} | ${label} (\`${a}\` vs \`${b}\`) | ${cells.join(' | ')} |`);
  }
}

console.log(out.join('\n'));
if (process.argv.includes('--check') && failures) {
  console.error(`\n${failures} pair(s) below target`);
  process.exit(1);
}
// Silence unused helper warning for toGamma (kept for anyone extending this to output hex).
void toGamma;
