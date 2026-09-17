// 実寸の翼竜でカメラの距離を比べる
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const CASES = [['0.15', '前回(後ろ18m)'], ['0.08', '今回の1(後ろ約10m)'], ['0.05', 'さらに寄せる(後ろ約6m)']];
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const shots = [];
for (const [k, name] of CASES) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844 });
  await p.goto(`${BASE}?harness&seed=17&cam=a&size=1&camk=${k}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 60000 });
  const w = await p.evaluate(() => { const s = window.__slice; s.auto(false); s.reset(); s.begin(); for (let i=0;i<90;i++) s.step(1/60,true);
    const l = s.bone('Wing04L'), r = s.bone('Wing04R'); return Math.abs(r.px[0] - l.px[0]); });
  const a = await p.screenshot({ encoding: 'base64' });
  await p.evaluate(() => { const s = window.__slice; s.forceInput = 1; for (let i=0;i<150;i++) s.step(1/60,true); s.forceInput = null; });
  const t = await p.screenshot({ encoding: 'base64' });
  console.log(`camk=${k} ${name}: 翼の幅 ${w.toFixed(0)}px`);
  shots.push({ k, name, a, t, w });
  await p.close();
}
const p = await b.newPage();
await p.setViewport({ width: 1560, height: 900 });
await p.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:22px;background:#14181e;color:#e8eef7;font-family:system-ui}
h1{font-size:18px;margin:0 0 14px}.row{display:flex;gap:22px}.col{flex:1}h2{font-size:14px;margin:0 0 8px}.pair{display:flex;gap:8px}
figure{margin:0;flex:1}img{width:100%;border-radius:6px;display:block}figcaption{font-size:11px;opacity:.7;margin-top:4px}</style>
<h1>実寸の翼竜・カメラの距離（スマホ縦）</h1><div class="row">${shots.map(s => `<div class="col"><h2>${s.name}・翼の幅${s.w.toFixed(0)}px</h2><div class="pair">
<figure><img src="data:image/png;base64,${s.a}"><figcaption>まっすぐ</figcaption></figure>
<figure><img src="data:image/png;base64,${s.t}"><figcaption>右へ2.5秒旋回</figcaption></figure></div></div>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await p.screenshot({ path: 'screenshots/_カメラの距離比較.png', fullPage: true });
await b.close();
