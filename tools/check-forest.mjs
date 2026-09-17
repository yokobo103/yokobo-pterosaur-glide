// 木と岩: 見た目(低空/中高度/旋回)と重さ(描いた三角形の数)。
// ソフトウェア描画ではGPUの仕事が時間に入らず、1コマの時間は当てにならないので出さない
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
async function open(extra) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${BASE}?harness&seed=17&cam=a${extra}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction((trees) => window.__slice && window.__slice.modelReady() && (!trees || window.__slice.forestReady()), { timeout: 90000 }, !extra.includes('notrees'));
  return { p, errs };
}
async function frameTimes(p, x, y, agl) {
  return p.evaluate((x, y, agl) => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(x, y, agl, 0);
    for (let i = 0; i < 30; i++) s.step(1/60, true);
    const f = []; for (let i = 0; i < 240; i++) { const t = performance.now(); s.step(1/60, true); f.push(performance.now() - t); }
    f.sort((a, b) => a - b);
    return { med: f[120], p95: f[228], max: f[239], info: s.forest() };
  }, x, y, agl);
}
const shots = [];
const { p, errs } = await open('');
for (const [label, x, y, agl] of [['林の上 低空60m', 0, 6000, 60], ['林の上 250m', 0, 6000, 250], ['山の近く 150m', 0, 12500, 150]]) {
  const r = await frameTimes(p, x, y, agl);
  console.log(`${label}: 描いた三角形 ${(r.info.frameTris/1e3).toFixed(0)}k(うち木 ${(r.info.tris/1e3).toFixed(0)}k) / 描画回数 ${r.info.calls} / 本数 ${JSON.stringify(r.info.counts)}`);
  shots.push({ label, img: await p.screenshot({ encoding: 'base64' }) });
}
await p.evaluate(() => { const s = window.__slice; s.place(0, 6000, 80, 0); for (let i=0;i<30;i++) s.step(1/60,true); s.forceInput = 1; for (let i=0;i<150;i++) s.step(1/60,true); s.forceInput = null; });
shots.push({ label: '林の上 80m 右へ旋回', img: await p.screenshot({ encoding: 'base64' }) });
console.log(errs.length ? errs : 'ページ内エラーなし');
await p.close();
const { p: p2 } = await open('&notrees');
const r2 = await frameTimes(p2, 0, 6000, 60);
console.log(`比較 木なし 低空60m: 描いた三角形 ${(r2.info.frameTris/1e3).toFixed(0)}k`);
await p2.close();
const sheet = await b.newPage();
await sheet.setViewport({ width: 1600, height: 900 });
await sheet.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:20px;background:#14181e;color:#e8eef7;font-family:system-ui}
h1{font-size:18px;margin:0 0 12px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px;display:block}
figcaption{font-size:12px;opacity:.75;margin-top:5px}</style><h1>木と岩（スマホ縦・カメラ5m）</h1><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sheet.screenshot({ path: 'screenshots/_木と岩.png', fullPage: true });
await b.close();
