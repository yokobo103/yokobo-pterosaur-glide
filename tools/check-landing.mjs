// 着地: 動きが切り替わるか、最後に地面に接しているか、絵の流れ
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };
// 平らな所で低く飛ばして、着地させる
await p.evaluate(() => { const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(0, 1500, 12, 0); s.forceInput = 0; });
const shots = [];
let prevDist = 0;
await p.evaluate(() => { const s = window.__slice; for (let i = 0; i < 60 * 12 && s.state().alive; i++) s.step(1/60, i % 3 === 0); s.render(); });
const at = await p.evaluate(() => window.__slice.state());
check('地面に着いた', !at.alive);
for (const [t, label] of [[0.3, '着地0.3秒'], [1.0, '1秒'], [2.5, '2.5秒'], [5.0, '5秒'], [7.5, '7.5秒(地上待機)']]) {
  const st = await p.evaluate(tt => {
    const s = window.__slice; const cur = s.landing() ? s.landing().t : 0;
    const n = Math.max(1, Math.round((tt - cur) * 60));
    for (let i = 0; i < n; i++) s.render();   // 機体は止まっているので描画だけ進める(演出はdtで進む)
    return s.landing();
  }, t);
  shots.push({ label, img: await p.screenshot({ encoding: 'base64' }) });
  if (label.startsWith('7.5')) {
    check(`最後は地上待機の動き(着地の動き ${st.land} / 待機 ${st.idle})`, st.idle);
    const lows = st.bones.filter(Boolean);
    const ys = await p.evaluate(() => ['HandL','HandR','FootL','FootR'].map(n => window.__slice.boneY(n)));
    const minY = Math.min(...ys);
    check(`手足が地面の近く(一番低い手足と地面の差 ${(minY - st.groundY).toFixed(2)}m)`, Math.abs(minY - st.groundY) < 0.6);
  }
  if (label === '5秒' || label.startsWith('7.5')) {
    const h = await p.evaluate(() => window.__slice.bone('Head'));
    check(`${label}: 翼竜が画面の中にいる(頭 ${h.px.map(Math.round)})`, h.px[0] > 0 && h.px[0] < 390 && h.px[1] > 0 && h.px[1] < 844);
    if (label === '5秒') prevDist = h.dist;
    else check(`地上待機に切り替わっても飛び戻らない(カメラから頭まで ${prevDist.toFixed(1)}m -> ${h.dist.toFixed(1)}m)`, Math.abs(h.dist - prevDist) < 0.8);
  }
  if (label === '1秒') check(`着地の動きに切り替わっている(滑空 ${st.glide} / 着地 ${st.land})`, st.land);
}
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs);
const s = await b.newPage();
await s.setViewport({ width: 1400, height: 800 });
await s.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:18px;background:#14181e;color:#e8eef7;font-family:system-ui}
h2{font-size:15px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:5px;display:block}figcaption{font-size:12px;text-align:center;opacity:.8;margin-top:4px}</style>
<h2>着地の動き</h2><div class="row">${shots.map(x => `<figure><img src="data:image/png;base64,${x.img}"><figcaption>${x.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await s.screenshot({ path: 'screenshots/_着地.png', fullPage: true });
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
