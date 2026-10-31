// Captures every screen of the final prototype with the repo's Playwright (require('playwright'))
// and the pre-installed Chromium. Never runs `playwright install`.
//   node capture.js            everything
//   node capture.js home       only jobs whose file name contains "home"
// Writes screens/*.png (the deliverables), checks/*.png (reflow, forced colours, high contrast,
// motion frames, marks) and prints an audit: fonts loaded, horizontal overflow, small targets.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const dir = __dirname;
const url = (params) => 'file://' + path.join(dir, 'index.html') + '?' + new URLSearchParams(params);
const PHONE = ['home', 'mystery', 'encore', 'practice', 'results'];
const jobs = [];
for (const s of PHONE) {
  for (const theme of ['light', 'dark']) jobs.push({ file: `screens/${s}-${theme}.png`, params: { screen: s, theme }, viewport: { width: 390, height: 844 }, audit: true });
  jobs.push({ file: `checks/reflow-320-${s}.png`, params: { screen: s, theme: 'light', reflow: 1 }, viewport: { width: 320, height: 640 }, fullPage: true, audit: true });
}
for (const theme of ['light', 'dark']) jobs.push({ file: `screens/mystery-solved-${theme}.png`, params: { screen: 'solved', theme }, viewport: { width: 390, height: 844 }, audit: true });
jobs.push({ file: 'screens/mystery-clue4-light.png', params: { screen: 'options', theme: 'light' }, viewport: { width: 390, height: 844 }, audit: true });
jobs.push({ file: 'checks/reflow-320-solved.png', params: { screen: 'solved', theme: 'light', reflow: 1 }, viewport: { width: 320, height: 640 }, fullPage: true, audit: true });
jobs.push({ file: 'checks/fold-360x640-home.png', params: { screen: 'home', theme: 'light' }, viewport: { width: 360, height: 640 }, audit: true });
jobs.push({ file: 'screens/share.png', params: { screen: 'share' }, viewport: { width: 1200, height: 630 } });
for (const theme of ['light', 'dark']) jobs.push({ file: `screens/host-lobby-${theme}.png`, params: { screen: 'host', theme }, viewport: { width: 1280, height: 720 }, audit: true });
jobs.push({ file: 'checks/host-lobby-1080p.png', params: { screen: 'host', theme: 'dark' }, viewport: { width: 1920, height: 1080 } });
// Accessibility modes
for (const theme of ['light', 'dark']) {
  jobs.push({ file: `checks/hc-feedback-practice-${theme}.png`, params: { screen: 'practice', theme, hc: 1 }, viewport: { width: 390, height: 844 } });
  jobs.push({ file: `checks/hc-feedback-results-${theme}.png`, params: { screen: 'results', theme, hc: 1 }, viewport: { width: 390, height: 844 } });
  jobs.push({ file: `checks/forced-colors-practice-${theme}.png`, params: { screen: 'practice', theme }, viewport: { width: 390, height: 844 }, forced: theme });
  jobs.push({ file: `checks/forced-colors-mystery-${theme}.png`, params: { screen: 'mystery', theme }, viewport: { width: 390, height: 844 }, forced: theme });
}
jobs.push({ file: 'checks/share-text-chat.png', params: { screen: 'sharetext' }, viewport: { width: 1360, height: 470 } });
jobs.push({ file: 'checks/marks.png', params: { screen: 'marks', theme: 'light' }, viewport: { width: 1100, height: 520 } });
// Motion: real CSS timelines frozen at set times
for (const t of [0, 120, 260, 400, 580, 900]) jobs.push({ file: `checks/frames/clue-${t}.png`, params: { screen: 'mystery', theme: 'light', animate: 1, t }, viewport: { width: 390, height: 844 }, clip: { x: 0, y: 40, width: 390, height: 360 }, frame: true });
for (const t of [380, 440, 520, 700, 1300, 1600]) jobs.push({ file: `checks/frames/answer-${t}.png`, params: { screen: 'practice', theme: 'light', animate: 1, t }, viewport: { width: 390, height: 844 }, frame: true });
jobs.push({ file: 'overview.png', params: {}, viewport: { width: 2200, height: 1200 }, fullPage: true });

async function audit(page, file) {
  return page.evaluate((file) => {
    const out = [];
    const fontsOk = ['700 20px Fraunces', '400 17px "Atkinson Hyperlegible Next"'].every((f) => document.fonts.check(f));
    if (!fontsOk) out.push('fonts not loaded');
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(`horizontal overflow ${document.documentElement.scrollWidth}px`);
    const small = [];
    for (const el of document.querySelectorAll('a, button, input, [role="option"]')) {
      if (el.closest('.sr-only, .kbd') || el.classList.contains('sr-only')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const hit = getComputedStyle(el, '::after');
      const hasHit = el.classList.contains('hit') && hit.content !== 'none';
      if ((r.width < 44 || r.height < 44) && !hasHit) small.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    if (small.length) out.push('small targets: ' + small.join('; '));
    // Anything clipped at the right edge (text running out of its box)
    const clipped = [];
    for (const el of document.querySelectorAll('.screen *')) {
      if (el.closest('.sr-only, .kbd')) continue;
      const cs = getComputedStyle(el);
      if (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > window.innerWidth + 0.5 && cs.position !== 'absolute') clipped.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
    }
    if (clipped.length) out.push('past the right edge: ' + [...new Set(clipped)].slice(0, 8).join(', '));
    return out.length ? `${file}: ${out.join(' | ')}` : `${file}: ok`;
  }, file);
}

(async () => {
  const only = process.argv[2];
  fs.mkdirSync(path.join(dir, 'screens'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'checks', 'frames'), { recursive: true });
  const browser = await chromium.launch();
  const reports = [];
  for (const job of jobs.filter((j) => !only || j.file.includes(only))) {
    const ctx = await browser.newContext({ viewport: job.viewport, deviceScaleFactor: 1, ...(job.forced ? { forcedColors: 'active', colorScheme: job.forced } : {}) });
    const page = await ctx.newPage();
    await page.goto(url(job.params));
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1' || !document.querySelector('#stage .screen, #stage .og, #stage .host') === false, null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    if (job.params.t !== undefined) await page.waitForSelector('html[data-frozen]', { timeout: 15000 });
    await page.waitForTimeout(200);
    if (job.audit) reports.push(await audit(page, job.file));
    await page.screenshot({ path: path.join(dir, job.file), fullPage: !!job.fullPage, ...(job.clip ? { clip: job.clip } : {}) });
    await ctx.close();
    console.log('wrote', job.file);
  }
  // Frame boards for the two reveals
  for (const kind of ['clue', 'answer']) {
    if (!fs.existsSync(path.join(dir, 'checks', 'frames'))) break;
    const frames = fs.readdirSync(path.join(dir, 'checks', 'frames')).filter((f) => f.startsWith(kind + '-')).sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));
    if (!frames.length || (only && !kind.includes(only) && !'frames'.includes(only))) continue;
    const html = `<!doctype html><body style="margin:0;padding:16px;background:#E8E1D5;font:700 14px system-ui;display:flex;gap:12px">${frames.map((f) => `<figure style="margin:0"><figcaption style="margin:0 0 6px">${parseInt(f.split('-')[1])} ms</figcaption><img src="frames/${f}" style="width:260px;border-radius:12px;box-shadow:0 0 0 1px #0002"></figure>`).join('')}</body>`;
    const board = path.join(dir, 'checks', `motion-${kind}.html`);
    fs.writeFileSync(board, html);
    const ctx = await browser.newContext({ viewport: { width: 1700, height: 400 } });
    const page = await ctx.newPage();
    await page.goto('file://' + board);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(dir, 'checks', `motion-${kind}-reveal.png`), fullPage: true });
    await ctx.close();
    fs.unlinkSync(board);
  }
  fs.rmSync(path.join(dir, 'checks', 'frames'), { recursive: true, force: true }); // the boards keep every frame
  await browser.close();
  if (reports.length) console.log('\nAudit\n' + reports.join('\n'));
})();
