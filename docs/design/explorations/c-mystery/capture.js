// Captures every prototype screen to PNG with the Chromium that ships with this machine's Playwright.
// It never runs `playwright install`.
//
//   node capture.js           screen1-light.png ... screen4-dark.png and share.png, at 390 x 844 CSS px (1x)
//   node capture.js --checks  also: 2x copies in hires/, 320 px wide reflow checks and a forced-colors
//                             check in checks/
//
// After loading, it prints an audit: fonts in use, the shortest answer button, the shortest suggestion,
// every control under 44 px, and anything that spills past the edge of its screen.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const CHECKS = process.argv.includes('--checks');
const SCREENS = [1, 2, 3, 4];
const THEMES = ['light', 'dark'];

async function open(browser, { scale = 1, query = '', forcedColors = 'none' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: scale, reducedMotion: 'reduce', forcedColors });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));
  await page.goto(PAGE + '?capture=1' + query);
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('800 30px "Bricolage Grotesque"'),
      document.fonts.load('400 17px "Atkinson Next"'),
      document.fonts.load('700 17px "Atkinson Next"'),
      document.fonts.load('700 12px "Atkinson Mono"'),
    ]);
    await document.fonts.ready;
  });
  await page.waitForFunction(() => window.__starsPainted === true);
  return { ctx, page, errors };
}

async function audit(page) {
  return page.evaluate(() => {
    const fonts = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))];
    const phones = [...document.querySelectorAll('.phone')].map((ph) => {
      const box = ph.getBoundingClientRect();
      const h = (sel) => [...ph.querySelectorAll(sel)].map((el) => Math.round(el.getBoundingClientRect().height));
      const small = [...ph.querySelectorAll('button, a, [role="option"]')]
        .filter((el) => !el.closest('.kb'))
        .map((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), t: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28) }; })
        .filter((r) => r.h < 44 || r.w < 44);
      const spill = [...ph.querySelectorAll('*')].filter((el) => {
        if (el.closest('svg') || el.closest('.sky') || el.classList.contains('sr-only') || el.closest('.sr-only')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > box.right + 0.5 || r.left < box.left - 0.5);
      }).map((el) => el.className || el.tagName).slice(0, 6);
      const min = (a) => (a.length ? Math.min(...a) : null);
      return { id: ph.id, size: `${Math.round(box.width)}x${Math.round(box.height)}`, minAnswer: min(h('.answer')), minOption: min(h('.opt')), minButton: min(h('.btn')), small, spill };
    });
    return { fonts, phones };
  });
}

function report(label, a, errors) {
  console.log(`\n== ${label}`);
  console.log('fonts loaded:', a.fonts.join(', '));
  for (const p of a.phones) {
    const bits = [`${p.id} ${p.size}`];
    if (p.minAnswer !== null) bits.push(`shortest answer ${p.minAnswer}px`);
    if (p.minOption !== null) bits.push(`shortest suggestion ${p.minOption}px`);
    if (p.minButton !== null) bits.push(`shortest button ${p.minButton}px`);
    bits.push(p.small.length ? `under 44px: ${p.small.map((s) => `${s.t} (${s.w}x${s.h})`).join('; ')}` : 'no controls under 44px');
    bits.push(p.spill.length ? `SPILLS: ${p.spill.join(', ')}` : 'no overflow');
    console.log(' ' + bits.join(' | '));
  }
  if (errors.length) console.log('page errors:', errors);
}

async function shoot(page, outDir, suffix = '') {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const n of SCREENS) for (const t of THEMES) {
    const file = path.join(outDir, `screen${n}-${t}${suffix}.png`);
    await page.locator(`#s${n}-${t}`).screenshot({ path: file });
    written.push(file);
  }
  return written;
}

// Freezes the two signature animations at set times (Web Animations API) and lays the frames out as filmstrips.
async function motion(browser, written) {
  const { ctx, page } = await open(browser, { scale: 2 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const shots = { clue: [], answer: [] };

  for (const t of [0, 120, 240, 360, 560, 1000]) {
    await page.evaluate((t) => {
      const ph = document.getElementById('s2-dark');
      ph.classList.add('play-clue');
      ph.getAnimations({ subtree: true }).forEach((a) => { a.pause(); a.currentTime = t; });
    }, t);
    shots.clue.push({ t, data: (await page.locator('#s2-dark .clues').screenshot()).toString('base64') });
  }

  const frames = [
    { t: 0, label: '0 ms: pressed on pointerdown', step: 'press' },
    { t: 150, label: '150 ms: locked in', step: 'lock' },
    { t: 460, label: '460 ms: reveal, shake mid-swing', step: 'reveal', at: 60 },
    { t: 700, label: '700 ms: verdict settled', step: 'reveal', at: 300 },
    { t: 1380, label: '1,380 ms: the why sheet rising', step: 'sheet', at: 150 },
    { t: 1600, label: '1,600 ms: at rest, Continue under the thumb', step: 'sheet', at: 400 },
  ];
  await page.evaluate(() => {
    const ph = document.getElementById('s3-light');
    ph.__answers = [...ph.querySelectorAll('.answer')].map((a) => ({ cls: a.className, key: a.querySelector('.answer__key').innerHTML }));
  });
  for (const f of frames) {
    await page.evaluate((f) => {
      const ph = document.getElementById('s3-light');
      const answers = [...ph.querySelectorAll('.answer')];
      const sheet = ph.querySelector('.sheet');
      answers.forEach((a, i) => {
        const pill = a.querySelector('.answer__pill');
        if (f.step === 'press' || f.step === 'lock') {
          a.className = 'answer' + (i === 0 ? (f.step === 'press' ? ' answer--pressed' : ' answer--locked') : '');
          a.querySelector('.answer__key').textContent = 'ABCD'[i];
          if (pill) pill.style.visibility = 'hidden';
        } else {
          a.className = ph.__answers[i].cls + ' is-revealing';
          a.querySelector('.answer__key').innerHTML = ph.__answers[i].key;
          if (pill) pill.style.visibility = '';
        }
      });
      sheet.classList.toggle('is-hidden', f.step !== 'sheet');
      sheet.classList.toggle('is-rising', f.step === 'sheet');
      ph.getAnimations({ subtree: true }).forEach((a) => {
        if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) { a.finish(); return; }
        a.pause();
        const isSheet = a.effect && a.effect.target === sheet;
        a.currentTime = f.step === 'sheet' ? (isSheet ? f.at : 2000) : (f.at || 0);
      });
    }, f);
    shots.answer.push({ label: f.label, data: (await page.locator('#s3-light').screenshot({ scale: 'css' })).toString('base64') });
  }

  const strip = (title, sub, items, bg, fg, w) => `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:${bg};color:${fg};font-family:'Atkinson Next',system-ui,sans-serif;padding:36px 40px 40px}
    @font-face{font-family:'Atkinson Next';src:url('${pathToFileURL(path.join(ROOT, 'fonts/atkinson-hyperlegible-next-latin-wght-normal.woff2')).href}')}
    h1{font-size:26px;margin:0 0 4px} p{margin:0 0 22px;font-size:16px;opacity:.8}
    .g{display:grid;grid-template-columns:repeat(3,${w}px);gap:22px 22px} figure{margin:0} img{width:${w}px;display:block;border-radius:14px}
    figcaption{font-size:15px;font-weight:700;margin-top:9px}</style></head><body><h1>${title}</h1><p>${sub}</p><div class="g">${items.map((i) => `<figure><img src="data:image/png;base64,${i.data}"><figcaption>${i.label}</figcaption></figure>`).join('')}</div></body></html>`;

  const out = await ctx.newPage();
  await out.setViewportSize({ width: 1260, height: 800 });
  await out.setContent(strip('Clue reveal: the evidence slides into the lamp', 'Card: 560 ms, ease-out (0.16, 1, 0.3, 1), rising 10 px out of a 5 px blur. Beam: 900 ms after a 120 ms delay. "Just in" tag: 260 ms spring at 420 ms. The fourth star dims at 300 ms.', shots.clue.map((s) => ({ label: `${s.t} ms`, data: s.data })), '#0B0E2E', '#F4F2FF', 372));
  await out.screenshot({ path: path.join(ROOT, 'checks', 'motion-clue-reveal.png'), fullPage: true });
  written.push(path.join(ROOT, 'checks', 'motion-clue-reveal.png'));
  await out.setViewportSize({ width: 1330, height: 900 });
  await out.setContent(strip('Answer reveal in practice (synthesis 8.3 timeline)', 'Press on pointerdown, commit on click. Lock-in by 150 ms, reveal at 400 ms with a 6 px two-cycle shake (320 ms) on a wrong pick, pills slide in over 200 ms, the sheet rises at about 1.2 s (360 ms, ease-out). Under reduced motion every step is a 160 ms fade.', shots.answer, '#F5F3FA', '#15183F', 390));
  await out.screenshot({ path: path.join(ROOT, 'checks', 'motion-answer-reveal.png'), fullPage: true });
  written.push(path.join(ROOT, 'checks', 'motion-answer-reveal.png'));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  const written = [];

  const main = await open(browser);
  report('390 x 844, 1x', await audit(main.page), main.errors);
  written.push(...(await shoot(main.page, ROOT)));
  await main.page.locator('#share').screenshot({ path: path.join(ROOT, 'share.png') });
  written.push(path.join(ROOT, 'share.png'));
  await main.ctx.close();

  if (CHECKS) {
    const hi = await open(browser, { scale: 2 });
    written.push(...(await shoot(hi.page, path.join(ROOT, 'hires'), '@2x')));
    await hi.page.locator('#share').screenshot({ path: path.join(ROOT, 'hires', 'share@2x.png') });
    written.push(path.join(ROOT, 'hires', 'share@2x.png'));
    await hi.ctx.close();

    const narrow = await open(browser, { query: '&w=320' });
    report('320 px wide, natural height', await audit(narrow.page), narrow.errors);
    written.push(...(await shoot(narrow.page, path.join(ROOT, 'checks'), '-320')));
    await narrow.ctx.close();

    const forced = await open(browser, { forcedColors: 'active' });
    for (const t of THEMES) {
      const file = path.join(ROOT, 'checks', `screen3-${t}-forced-colors.png`);
      await forced.page.locator(`#s3-${t}`).screenshot({ path: file });
      written.push(file);
    }
    await forced.ctx.close();

    await motion(browser, written);
  }

  await browser.close();
  console.log('\nwrote:\n' + written.map((f) => ' ' + path.relative(ROOT, f)).join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
