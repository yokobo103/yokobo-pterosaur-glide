// 木と岩を近景/遠景版で横一列に並べて撮る(左から 針葉樹・近/遠, イチョウ・近/遠, 岩)
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 600 });
await p.goto(`${BASE}?harness&seed=17&cam=a&size=3`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.forestReady(), { timeout: 90000 });
await p.evaluate(() => { const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(0, 2000, 25, 0); for (let i=0;i<10;i++) s.step(1/60,true); s.vegLineup(260); for (let i=0;i<5;i++) s.step(1/60,true); });
await p.screenshot({ path: 'screenshots/veg-lineup.png' });
await b.close();
