// ドリオサウルスの歩く姿を近くから見る(調整用)。コマを追って並べる
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.dryoReady(), { timeout: 90000 });
const herd = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  return s.herdsNear(0, 0, 12000, 'dryo').sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0];
});
// 歩いている個体の正面やや横に構えて、歩き1周期ぶんを追う
await p.evaluate(h => { const s = window.__slice; s.place(h.cx, h.cy - 45, 14, 0); for (let i = 0; i < 60 * 5; i++) s.render(); }, herd);
const shots = [];
for (let k = 0; k < 4; k++) {
  await p.evaluate(() => { for (let i = 0; i < 9; i++) window.__slice.render(); });   // 1周期(1.5秒)を4分割
  shots.push({ label: `${(k * 0.15).toFixed(2)}秒`, img: await p.screenshot({ encoding: 'base64', clip: { x: 0, y: 330, width: 390, height: 330 } }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1320, height: 400 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:4px}figcaption{font-size:11px;text-align:center}</style>
<h2>ドリオサウルスの歩き（コマ送り）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_ドリオ歩き.png', fullPage: true });
await b.close();
console.log('screenshots/_ドリオ歩き.png');
