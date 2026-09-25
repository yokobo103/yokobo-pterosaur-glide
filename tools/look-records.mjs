// 走行の終わりの画面(記録つき)をスマホ相当で撮る
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await p.evaluate(() => {
  localStorage.setItem('glide.records', JSON.stringify([
    { name: 'よこぼ', km: 11.42, found: 9, at: 1 }, { name: 'たろう', km: 8.03, found: 5, at: 2 },
    { name: 'よこぼ', km: 6.55, found: 4, at: 3 }, { name: 'はなこ', km: 4.10, found: 2, at: 4 },
  ]));
  localStorage.setItem('glide.name', 'よこぼ');
});
await p.reload({ waitUntil: 'networkidle0' });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
const shots = [];
await p.evaluate(() => { const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(0, 500, 400, 0); for (let i = 0; i < 60 * 40; i++) s.step(1 / 60, true); });
await p.evaluate(() => { const s = window.__slice; s.place(0, 4000, 3, 0); for (let i = 0; i < 60 * 8; i++) s.step(1 / 60, true); });
await p.waitForFunction(() => !document.getElementById('msg').classList.contains('hidden'), { timeout: 20000 });
shots.push({ label: '名前を入れる前', img: await p.screenshot({ encoding: 'base64' }) });
await p.click('#nameGo');
shots.push({ label: '記録したあと', img: await p.screenshot({ encoding: 'base64' }) });
const sh = await b.newPage(); await sh.setViewport({ width: 900, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:11px;text-align:center}</style>
<h2>走行の終わり（キョリの記録）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_記録.png', fullPage: true });
await b.close();
console.log('screenshots/_記録.png');
