// カメラの型を並べる。まっすぐ／右へ旋回中 を同じ場面で。
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';
const KEYS = [['a','水平キープ'],['b','少しだけ傾く'],['c','見下ろし']];
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const imgs = [];
for (const [k, name] of KEYS) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844 });
  await p.goto(`${process.env.GLIDE_BASE || 'http://localhost:8141/'}?harness&seed=17&cam=${k}`, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => !!window.__slice);
  await p.evaluate(() => { const s=window.__slice; s.auto(false); s.reset(); s.begin(); for(let i=0;i<150;i++) s.step(1/60,true); });
  const a = await p.screenshot({ encoding: 'base64' });
  await p.evaluate(() => { const s=window.__slice; s.forceInput=1; for(let i=0;i<150;i++) s.step(1/60,true); s.forceInput=null; });
  const t = await p.screenshot({ encoding: 'base64' });
  imgs.push({ k, name, a, t });
  await p.close();
}
const cells = imgs.map(i => `<div class="col"><h2>${i.k}：${i.name}</h2><div class="pair">
  <figure><img src="data:image/png;base64,${i.a}"><figcaption>まっすぐ</figcaption></figure>
  <figure><img src="data:image/png;base64,${i.t}"><figcaption>右へ2.5秒旋回</figcaption></figure></div></div>`).join('');
const p = await b.newPage();
await p.setViewport({ width: 1560, height: 900 });
await p.setContent(`<meta charset="utf-8"><style>
 body{margin:0;padding:22px;background:#14181e;color:#e8eef7;font-family:system-ui,sans-serif}
 h1{font-size:18px;margin:0 0 14px} .row{display:flex;gap:22px} .col{flex:1}
 h2{font-size:14px;margin:0 0 8px} .pair{display:flex;gap:8px} figure{margin:0;flex:1}
 img{width:100%;border-radius:6px;display:block} figcaption{font-size:11px;opacity:.7;margin-top:4px}
</style><h1>カメラの型（スマホ縦・同じ場面）</h1><div class="row">${cells}</div>`, { waitUntil: 'networkidle0' });
await p.screenshot({ path: 'screenshots/_カメラ比較.png', fullPage: true });
await b.close();
console.log('screenshots/_カメラ比較.png');
