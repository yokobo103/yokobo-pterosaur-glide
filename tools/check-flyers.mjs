// 他の翼竜: 上昇気流の中にいるか、画面での見え方、自分の大きさが変わっていないか
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.flyersReady(), { timeout: 90000 });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };
// 自分の翼竜の画面での大きさ(前は翼の幅66px)
const me = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  for (let i = 0; i < 90; i++) s.step(1/60, true);
  const l = s.bone('Wing04L'), r = s.bone('Wing04R');
  return { wingPx: Math.abs(r.px[0] - l.px[0]), dist: r.dist };
});
console.log(`  自分の翼竜: 画面の翼の幅 ${me.wingPx.toFixed(0)}px / カメラから ${me.dist.toFixed(1)}m`);
check('自分の見え方は前と同じ(翼の幅230px前後。大きさとカメラ距離を同じ倍率で変えたため)', me.wingPx > 210 && me.wingPx < 260);
// 他の翼竜
const fl = await p.evaluate(() => {
  const s = window.__slice;
  const rows = [];
  for (let k = 0; k < 8; k++) { for (let i = 0; i < 30; i++) s.step(1/60, true); rows.push(s.flyers()); }
  return rows;
});
const all = fl.flat();
const withLift = all.filter(f => f.lift > 0);
const near = all.filter(f => f.dist < 800);
console.log(`  他の翼竜: 記録 ${all.length}件 / 上昇気流の中にいた ${(withLift.length / Math.max(all.length,1) * 100).toFixed(0)}%`);
check('上がる空気の中を飛んでいる', withLift.length / Math.max(all.length, 1) > 0.8);
check(`高さが地面より上(一番低い個体 ${Math.min(...all.map(f => f.agl)).toFixed(0)}m)`, Math.min(...all.map(f => f.agl)) > 20);
console.log(`  800m以内にいたとき 画面 ${near.length ? Math.max(...near.map(f => f.sizePx)).toFixed(0) : '-'}px`);
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
// 絵
const shots = [];
for (const d of [800, 350, 120]) {
  const info = await p.evaluate(d => {
    const s = window.__slice;
    const f = s.flyers().sort((x, y) => x.dist - y.dist)[0];
    if (!f) return null;
    // 相手と同じ高さに並び、相手の方を向いて置く
    s.place(f.x, f.y - d, f.agl, 0);
    for (let i = 0; i < 40; i++) s.step(1/60, true);
    const now = s.flyers().sort((x, y) => x.dist - y.dist)[0];
    return { px: Math.round(now.sizePx), dist: Math.round(now.dist), inFrame: now.inFrame };
  }, d);
  console.log(`  ${d}m先の翼竜: 画面 ${info?.px}px / 枠の中 ${info?.inFrame}`);
  shots.push({ label: `${d}m先（${info?.px}px）`, img: await p.screenshot({ encoding: 'base64' }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1200, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:16px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:15px;margin:0 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:12px;text-align:center;margin-top:4px}</style>
<h2>他の翼竜（上昇気流の中を旋回）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_他の翼竜.png', fullPage: true });
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
