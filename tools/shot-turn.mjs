import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await p.goto((process.env.GLIDE_BASE || 'http://localhost:8141/') + '?harness&seed=17', { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => !!window.__slice);
await p.evaluate(() => { const s = window.__slice; s.auto(false); s.reset(); s.begin(); for (let i=0;i<180;i++) s.step(1/60,true); });
await p.screenshot({ path: 'screenshots/turn-00-まっすぐ.png' });
await p.evaluate(() => { const s = window.__slice; s.forceInput = 1; for (let i=0;i<110;i++) s.step(1/60,true); });
await p.screenshot({ path: 'screenshots/turn-01-右へ旋回中.png' });
await b.close();
console.log('撮った');
