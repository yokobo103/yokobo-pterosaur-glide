// 遠景の見え方: 高いところから、何kmも向こうの群れが見えるか
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.dinosReady(), { timeout: 120000 });
const shots = [];
for (const [d, alt] of [[1500, 320], [3000, 500], [5000, 700]]) {
  const info = await p.evaluate(([d, alt]) => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    const h = s.herdsNear(0, 0, 14000, 'brachio').sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0];
    s.place(h.cx, h.cy - d, alt, 0);
    for (let i = 0; i < 60; i++) s.render();
    const st = s.sceneStats();
    return { calls: s.info().calls, tris: s.info().tris };
  }, [d, alt]);
  shots.push({ label: `${(d / 1000).toFixed(1)}km先 / 高さ${alt}m (${info.calls}回・${(info.tris / 1000).toFixed(0)}k)`,
               img: await p.screenshot({ encoding: 'base64', clip: { x: 0, y: 200, width: 390, height: 500 } }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1320, height: 620 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:4px}figcaption{font-size:11px;text-align:center}</style>
<h2>${process.argv[2] || '遠景（ブラキオサウルスの群れの方を見る）'}</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: `screenshots/_遠景${process.argv[3] || ''}.png`, fullPage: true });
await b.close();
console.log(`screenshots/_遠景${process.argv[3] || ''}.png`);
