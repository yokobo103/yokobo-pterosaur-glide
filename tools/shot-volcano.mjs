// 火山が見える場面と、中生代化の前後比較シート
import fs from 'node:fs';
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.forestReady(), { timeout: 90000 });
const info = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  const vs = s.volcanoes(30000).filter(v => v.y > 4000).sort((a, b) => (a.y + Math.abs(a.x)) - (b.y + Math.abs(b.x)));
  const v = vs[0]; if (!v) return null;
  s.place(v.x - 1500, v.y - 7000, 260, Math.atan2(1500, 7000));
  for (let i = 0; i < 400; i++) s.step(1/60, i % 4 === 0);   // 噴煙が立ち上がるまで回す
  s.render();
  return v;
});
console.log('火山:', info, errs.length ? errs : 'エラーなし');
await p.screenshot({ path: 'screenshots/volcano.png' });
await b.close();
const img = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const b2 = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const s = await b2.newPage();
await s.setViewport({ width: 1600, height: 900 });
await s.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:20px;background:#14181e;color:#e8eef7;font-family:system-ui}
h2{font-size:15px;margin:14px 0 8px}img{border-radius:6px;display:block}.row{display:flex;gap:16px;align-items:flex-start}</style>
<h2>前（草原っぽい黄土色）</h2><img src="${img('screenshots/_木と岩_中生代化の前.png')}" style="width:1180px">
<h2>後（赤茶の土・シダの緑・泥・暖かい霞）＋ 火山</h2><div class="row"><img src="${img('screenshots/_木と岩.png')}" style="width:1180px"><img src="${img('screenshots/volcano.png')}" style="width:300px"></div>`, { waitUntil: 'networkidle0' });
await s.screenshot({ path: 'screenshots/_中生代化の前後.png', fullPage: true });
await b2.close();
