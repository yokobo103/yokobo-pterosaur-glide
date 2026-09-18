// 上空から群れをどう見つけるか: 距離ごとの見え方
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.stegoReady(), { timeout: 90000 });
const shots = [];
for (const [d, alt, label] of [[1500, 300, '1.5km手前・高度300m'], [700, 250, '700m手前・高度250m'], [350, 150, '350m手前・高度150m'], [150, 60, '150m手前・高度60m']]) {
  const info = await p.evaluate((d, a) => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    const h = s.herdsNear(0, 0, 8000).sort((x, y) => Math.hypot(x.cx, x.cy) - Math.hypot(y.cx, y.cy))[0];
    s.place(h.cx, h.cy - d, a, 0);
    for (let i = 0; i < 90; i++) s.render();
    const vis = s.stegos().filter(x => x.inFrame);
    return { n: vis.length, maxPx: Math.round(Math.max(0, ...vis.map(x => x.sizePx))) };
  }, d, alt);
  console.log(`${label}: 画面に映った個体 ${info.n}頭 / 一番大きい ${info.maxPx}px`);
  shots.push({ label: `${label}（${info.n}頭・最大${info.maxPx}px）`, img: await p.screenshot({ encoding: 'base64' }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1500, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:16px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:15px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:12px;text-align:center;margin-top:4px;opacity:.85}</style>
<h2>群れの見つけ方（近づくほど：踏み荒らされた地面 → 点 → 姿）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_群れの見つけ方.png', fullPage: true });
await b.close();
