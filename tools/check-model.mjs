// 本物の翼竜の向きを、骨の位置で検査する(灰色の箱の検査とは別。モデル自体が逆向きでも箱の検査は通ってしまう)
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };
const shots = [];
for (const size of ['1', '2', '3']) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${BASE}?harness&seed=17&cam=a&size=${size}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 30000 });
  console.log(`■ size=${size}`);
  const straight = await p.evaluate(() => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    for (let i = 0; i < 90; i++) s.step(1/60, true);
    return { head: s.bone('Head'), tail: s.bone('Tail04'), wl: s.bone('Wing04L'), wr: s.bone('Wing04R') };
  });
  check('骨が見つかる', straight.head && straight.tail && straight.wl && straight.wr);
  if (!straight.head) { await p.close(); continue; }
  check(`機首が向こう、尾がこちら(頭まで${straight.head.dist.toFixed(1)}m / 尾まで${straight.tail.dist.toFixed(1)}m)`, straight.head.dist > straight.tail.dist);
  check('左翼が画面の左', straight.wl.px[0] < straight.wr.px[0]);
  const span = Math.abs(straight.wr.px[0] - straight.wl.px[0]);
  console.log(`  画面上の翼の幅 ${span.toFixed(0)}px (画面幅390px)`);
  shots.push({ size, straight: await p.screenshot({ encoding: 'base64' }) });
  const turn = await p.evaluate(() => {
    const s = window.__slice; s.forceInput = 1;
    for (let i = 0; i < 150; i++) s.step(1/60, true);
    s.forceInput = null;
    return { wl: s.bone('Wing04L'), wr: s.bone('Wing04R'), head: s.bone('Head'), tail: s.bone('Tail04') };
  });
  const rightWing = turn.wl.px[0] > turn.wr.px[0] ? turn.wl : turn.wr, leftWing = rightWing === turn.wl ? turn.wr : turn.wl;
  check('右旋回で、画面の右側の翼が下がる', rightWing.px[1] > leftWing.px[1]);
  check('右旋回中も機首は向こう側', turn.head.dist > turn.tail.dist);
  shots[shots.length - 1].turn = await p.screenshot({ encoding: 'base64' });
  check('エラーなし', errs.length === 0); if (errs.length) console.log(errs);
  await p.close();
}
// 比較シート
const names = { 1: '1: 実寸2.2m・カメラを寄せる', 2: '2: 翼開長10m', 3: '3: 翼開長22m' };
const p = await b.newPage();
await p.setViewport({ width: 1560, height: 900 });
await p.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:22px;background:#14181e;color:#e8eef7;font-family:system-ui}
h1{font-size:18px;margin:0 0 14px}.row{display:flex;gap:22px}.col{flex:1}h2{font-size:14px;margin:0 0 8px}.pair{display:flex;gap:8px}
figure{margin:0;flex:1}img{width:100%;border-radius:6px;display:block}figcaption{font-size:11px;opacity:.7;margin-top:4px}</style>
<h1>翼竜の大きさ（スマホ縦・水平キープ）</h1><div class="row">${shots.map(s => `<div class="col"><h2>${names[s.size]}</h2><div class="pair">
<figure><img src="data:image/png;base64,${s.straight}"><figcaption>まっすぐ</figcaption></figure>
<figure><img src="data:image/png;base64,${s.turn}"><figcaption>右へ2.5秒旋回</figcaption></figure></div></div>`).join('')}</div>`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.screenshot({ path: 'screenshots/_翼竜の大きさ比較.png', fullPage: true });
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
