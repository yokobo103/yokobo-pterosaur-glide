// 群れの土ぼこりが遠くから見えるか
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.stegoReady(), { timeout: 90000 });
const herd = await p.evaluate(() => { const s = window.__slice; s.auto(false); s.reset(); s.begin();
  return s.herdsNear(0, 3000, 12000).sort((a, b) => Math.hypot(a.cx, a.cy - 3000) - Math.hypot(b.cx, b.cy - 3000))[0]; });
console.log('群れ:', herd);
const shots = [];
for (const [d, alt, label] of [[2000, 300, '2km手前・高度300m'], [1000, 250, '1km手前・高度250m'], [400, 150, '400m手前・高度150m'], [120, 40, '120m手前・高度40m']]) {
  await p.evaluate((h, d, alt) => { const s = window.__slice; s.place(h.cx, h.cy - d, alt, 0); for (let i = 0; i < 60 * 8; i++) s.render(); }, herd, d, alt);
  shots.push({ label, img: await p.screenshot({ encoding: 'base64' }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1500, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:16px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:15px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:12px;text-align:center;margin-top:4px;opacity:.8}</style>
<h2>ステゴサウルスの群れ（土ぼこりつき）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_ステゴサウルス.png', fullPage: true });
await b.close();
