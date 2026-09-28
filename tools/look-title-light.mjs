// タイトルの後ろの見本飛行を、明るさ(日の傾き)と高さで見比べる
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const shots = [];
for (const alt of [320, 520, 780]) {
  for (const tt of [0.35, 0.62, 0.78]) {
    await p.goto(`${BASE}?seed=17&demotime=${tt}&demoalt=${alt}`, { waitUntil: 'networkidle0', timeout: 120000 });
    await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
    await new Promise(r => setTimeout(r, 7000));
    const sun = await p.evaluate(() => window.__slice.state().sun);
    shots.push({ label: `高さ${alt}m / 日 ${tt} (光 ${sun.toFixed(2)})`, img: await p.screenshot({ encoding: 'base64' }) });
    console.log(`  ${shots[shots.length - 1].label}`);
  }
}
const sh = await b.newPage(); await sh.setViewport({ width: 1300, height: 1400 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}figure{margin:0}img{width:100%;border-radius:6px;display:block}
figcaption{font-size:11px;text-align:center;opacity:.85;padding-top:4px}</style>
<div class="grid">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_タイトルの光.png', fullPage: true });
await b.close();
console.log('screenshots/_タイトルの光.png');
