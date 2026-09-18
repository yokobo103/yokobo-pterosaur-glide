// 高度300mで、カメラの下向きあり/なしを同じ場面で比べる
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const shots = [];
for (const [ld, label] of [['0', '下向きなし(前の版)'], ['0.45', '下向き0.45(今)'], ['0.8', '下向き0.8']]) {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
  await p.goto(`${BASE}?harness&seed=5&cam=a&lookdrop=${ld}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__slice && window.__slice.stegoReady(), { timeout: 90000 });
  const info = await p.evaluate(() => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    const h = s.herdsNear(0, 0, 8000).sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0];
    s.place(h.cx, h.cy - 500, 300, 0);
    for (let i = 0; i < 90; i++) s.render();
    const list = s.stegos().filter(a => a.inFrame);
    return { herd: [Math.round(h.cx), Math.round(h.cy)], onScreen: list.length, maxPx: Math.round(Math.max(0, ...list.map(a => a.sizePx))), all: s.stegos().length };
  });
  console.log(`${label}: 画面に映った個体 ${info.onScreen}/${info.all} / 一番大きい ${info.maxPx}px`);
  shots.push({ label, img: await p.screenshot({ encoding: 'base64' }) });
  await p.close();
}
const sh = await b.newPage(); await sh.setViewport({ width: 1300, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:16px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:15px;margin:0 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:12px;text-align:center;margin-top:4px}</style>
<h2>高度300m・群れの500m手前（カメラの下向き具合）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_カメラ下向き.png', fullPage: true });
await b.close();
