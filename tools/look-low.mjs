// 低空の空気(砂粒)が見えるか: 乾いた所と湿った所、高さ別
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
const shots = [];
for (const [x, y, alt, label] of [[6100, -2400, 25, '乾いた台地 高さ25m'], [6100, -2400, 90, '同じ場所 高さ90m'],
                                  [1234, 5678, 25, '川沿い 高さ25m'], [2600, -5200, 25, '林の縁 高さ25m']]) {
  const n = await p.evaluate(([x, y, alt]) => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(x, y, alt, 0);
    for (let i = 0; i < 120; i++) s.step(1 / 60, true);
    const st = s.sceneStats();
    return st['地表の空気'] ? st['地表の空気'].calls : 0;
  }, [x, y, alt]);
  shots.push({ label: `${label} (描画${n}回)`, img: await p.screenshot({ encoding: 'base64', clip: { x: 0, y: 330, width: 390, height: 420 } }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1320, height: 560 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:4px}figcaption{font-size:11px;text-align:center}</style>
<h2>地面すれすれの空気（砂粒）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_低空の空気.png', fullPage: true });
await b.close();
console.log('screenshots/_低空の空気.png');
