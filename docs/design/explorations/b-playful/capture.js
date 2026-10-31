// Captures every prototype screen to PNG with Playwright's pre-installed Chromium.
// Never runs `playwright install`; it uses the browsers already on this machine.
//
//   node capture.js            screen1-light.png ... screen4-dark.png and share.png (exact CSS size, 1x)
//   node capture.js --all      also 2x copies in ./hires/ and 320 px wide checks in ./checks/
//
// After capturing, it prints a small audit per screen: fonts loaded, the shortest answer
// button, the shortest primary-size button, and any element wider than the screen.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const ALL = process.argv.includes('--all');

async function capture(browser, { scale, outDir, query, suffix }) {
  fs.mkdirSync(outDir, { recursive: true });
  const ctx = await browser.newContext({ deviceScaleFactor: scale, viewport: { width: 1400, height: 1000 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));
  await page.goto(PAGE + '?capture=1' + (query || ''));
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('700 20px Fredoka'),
      document.fonts.load('600 20px Fredoka'),
      document.fonts.load('400 20px "Atkinson Next"'),
      document.fonts.load('700 20px "Atkinson Next"'),
    ]);
    await document.fonts.ready;
  });
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
  const audit = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.phone').forEach((ph) => {
      const box = ph.getBoundingClientRect();
      const answers = [...ph.querySelectorAll('.answer')].map((b) => Math.round(b.getBoundingClientRect().height));
      const bigButtons = [...ph.querySelectorAll('.btn:not(.btn--sm)')].map((b) => Math.round(b.getBoundingClientRect().height));
      const targets = [...ph.querySelectorAll('button, a, [role="option"]')].filter((el) => !el.closest('.kbd'))
        .map((el) => { const r = el.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), t: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) }; })
        .filter((r) => r.h < 44 || r.w < 44);
      const wide = [...ph.querySelectorAll('*')].filter((el) => {
        if (el.closest('.kbd') || el.closest('svg') || el.closest('.sr-only')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > box.right + 0.5 || r.left < box.left - 0.5);
      }).map((el) => el.className && el.className.baseVal === undefined ? el.className : el.tagName).slice(0, 6);
      out.push({ id: ph.id, size: `${Math.round(box.width)}x${Math.round(box.height)}`,
        minAnswer: answers.length ? Math.min(...answers) : null,
        minButton: bigButtons.length ? Math.min(...bigButtons) : null,
        smallTargets: targets, overflow: wide });
    });
    return out;
  });
  // Shoot each screen in solo mode, pinned at the page origin, so files are exactly 390 x 844 (or 1200 x 630)
  const written = [];
  const shots = [];
  for (const n of [1, 2, 3, 4]) for (const theme of ['light', 'dark']) shots.push([`s${n}-${theme}`, `screen${n}-${theme}${suffix || ''}.png`]);
  if (!query) shots.push(['share', 'share.png']);
  for (const [id, name] of shots) {
    await page.goto(PAGE + '?capture=1&solo=' + id + (query || ''));
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(outDir, name);
    await page.locator('#' + id).screenshot({ path: file });
    written.push(file);
  }
  await ctx.close();
  return { written, fonts: [...new Set(fonts)], audit, errors };
}

(async () => {
  const browser = await chromium.launch();
  const runs = [{ scale: 1, outDir: ROOT }];
  if (ALL) {
    runs.push({ scale: 2, outDir: path.join(ROOT, 'hires') });
    runs.push({ scale: 2, outDir: path.join(ROOT, 'checks'), query: '&w=320', suffix: '-320w' });
  }
  for (const run of runs) {
    const r = await capture(browser, run);
    console.log(`\n[${run.scale}x${run.query ? ' 320 px' : ''}] fonts loaded: ${r.fonts.join(', ') || 'NONE'}`);
    if (r.errors.length) console.log('page errors:', r.errors);
    for (const a of r.audit) {
      const notes = [];
      if (a.minAnswer !== null) notes.push(`shortest answer ${a.minAnswer}px${a.minAnswer < 56 ? ' (UNDER 56)' : ''}`);
      if (a.minButton !== null) notes.push(`shortest main button ${a.minButton}px${a.minButton < 56 ? ' (UNDER 56)' : ''}`);
      if (a.smallTargets.length) notes.push(`under 44px: ${a.smallTargets.map((t) => `${t.t}(${t.w}x${t.h})`).join('; ')}`);
      if (a.overflow.length) notes.push(`OVERFLOW: ${a.overflow.join(', ')}`);
      console.log(`  ${a.id} ${a.size}  ${notes.join(' | ')}`);
    }
    console.log('  wrote ' + r.written.map((f) => path.relative(ROOT, f)).join(', '));
  }
  await browser.close();
})();
