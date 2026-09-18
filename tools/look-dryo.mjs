// ドリオサウルスの見た目を近くから拡大して見る(調整用)
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
const site = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  return s.sites(12000).filter(x => x.id === 'dryo_group')[0];
});
const shots = [];
for (const [d, alt] of [[35, 10], [70, 18], [140, 40]]) {
  await p.evaluate(({ s0, d, alt }) => {
    const w = window.__slice; w.place(s0.x, s0.y - d, alt, 0);
    for (let i = 0; i < 40; i++) w.render();
  }, { s0: site, d, alt });
  shots.push({ label: `${d}m手前 / 高さ${alt}m`, img: await p.screenshot({ encoding: 'base64', clip: { x: 0, y: 200, width: 390, height: 400 } }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1300, height: 560 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:16px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:15px;margin:0 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:12px;text-align:center;margin-top:4px}</style>
<h2>ドリオサウルスの一団（拡大）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_ドリオサウルス拡大.png', fullPage: true });
await b.close();
console.log('screenshots/_ドリオサウルス拡大.png');
