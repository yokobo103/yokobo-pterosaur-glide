// 地表の見え方を高さ別に並べる(調整用)
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
const shots = [];
for (const [x, y, alt, label] of [[1234, 5678, 60, '高さ60m'], [1234, 5678, 180, '高さ180m'], [1234, 5678, 420, '高さ420m'], [-4200, 2600, 520, '別の場所520m']]) {
  await p.evaluate(([x, y, alt]) => { const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(x, y, alt, 0); for (let i = 0; i < 25; i++) s.render(); }, [x, y, alt]);
  shots.push({ label, img: await p.screenshot({ encoding: 'base64', clip: { x: 0, y: 300, width: 390, height: 420 } }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1320, height: 520 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:4px}figcaption{font-size:11px;text-align:center}</style>
<h2>${process.argv[2] || '地表'}</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: `screenshots/_地表${process.argv[3] || ''}.png`, fullPage: true });
await b.close();
console.log(`screenshots/_地表${process.argv[3] || ''}.png`);
