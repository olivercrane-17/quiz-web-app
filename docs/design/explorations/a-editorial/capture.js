// Captures every prototype screen to PNG next to this file.
// Usage: node capture.js            (everything)
//        node capture.js screen2    (only files whose name starts with "screen2")
// Uses the pre-installed Chromium through PLAYWRIGHT_BROWSERS_PATH. Never run `playwright install`.
const path = require('path');
const { chromium } = require('playwright');

const dir = __dirname;
const url = (params, file = 'index.html') => 'file://' + path.join(dir, file) + '?' + new URLSearchParams(params);
const SCREENS = ['home', 'mystery', 'practice', 'results'];

const jobs = [];
SCREENS.forEach((screen, i) => {
  for (const theme of ['light', 'dark']) {
    jobs.push({ file: `screen${i + 1}-${theme}.png`, params: { screen, theme }, viewport: { width: 390, height: 844 } });
  }
  // Reflow check at the narrowest supported width, full height, keyboard hidden
  jobs.push({ file: `reflow-320-screen${i + 1}.png`, params: { screen, theme: 'light', reflow: 1 }, viewport: { width: 320, height: 568 }, fullPage: true });
});
jobs.push({ file: 'share.png', params: { screen: 'share' }, viewport: { width: 1200, height: 630 } });
jobs.push({ file: 'overview.png', params: {}, viewport: { width: 1800, height: 1000 }, fullPage: true });
// Motion frames: real CSS timelines paused at set times inside iframes
jobs.push({ file: 'motion-frames.png', page: 'motion.html', params: {}, viewport: { width: 1350, height: 900 }, fullPage: true, frozenFrames: 10 });

(async () => {
  const only = process.argv[2];
  const browser = await chromium.launch();
  for (const job of jobs.filter((j) => !only || j.file.startsWith(only))) {
    const page = await browser.newPage({ viewport: job.viewport, deviceScaleFactor: 1 });
    await page.goto(url(job.params, job.page));
    await page.evaluate(() => document.fonts.ready);
    if (job.frozenFrames) {
      // wait until every iframe has paused its animations at the requested time
      await page.waitForFunction((n) => {
        const frames = [...document.querySelectorAll('iframe')];
        return frames.length === n && frames.every((f) => f.contentDocument && f.contentDocument.documentElement.dataset.frozen !== undefined);
      }, job.frozenFrames, { timeout: 20000 }).catch(async () => {
        for (const f of page.frames().slice(1)) await f.waitForSelector('html[data-frozen]', { timeout: 20000 });
      });
    }
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(dir, job.file), fullPage: !!job.fullPage });
    await page.close();
    console.log('wrote', job.file);
  }
  await browser.close();
})();
