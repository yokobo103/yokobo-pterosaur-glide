// 地面の層の境目が「川のような線」に見えないか。
//
// 近景(2.6km四方)と遠景が重なる帯で、粗い遠景の面が細かい近景の上に出て、
// 暗い斑点が横一列に並んでいた(所長「読み込み時のラインが川に見える」)。
// いまは外側の層が内側の層の四角の中を描かない。ここでは
//   1. 形の上で粗い面が上に出ている点を探し(捨てる前の形で判定)
//   2. 層を色分けして描いた画素を読み、その点に遠景の色が出ていないか
// を見る。当たり判定だけでは描画で捨てた画素を知らないので、必ず画素で確かめる。
// 翼竜の茶色を遠景の赤と取り違えないよう、画素を読むときは地面以外を隠す。
// 絵は 直す前(?nocut) / いま を並べて screenshots/_層の境目.png に出す。
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };

const VIEWS = [
  { label: 'タイトルの視点', cam: 'title', x: 0, y: 0, agl: 380, head: 0 },
  { label: '飛行中 400m', cam: 'a', x: 0, y: 0, agl: 400, head: 0 },
  { label: '飛行中 150m', cam: 'a', x: 2000, y: 6000, agl: 150, head: 0.6 },
];

const measure = v => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(v.x, v.y, v.agl, v.head); s.forceInput = 0;
  for (let i = 0; i < 90; i++) s.render();
  const W = innerWidth, H = innerHeight, pts = [], st = s.state();
  const inside = (gx, gy) => Math.abs(gx - st.x) < 1150 && Math.abs(gy - st.y) < 1150;
  for (let j = 0; j < 60; j++) for (let i = 0; i < 24; i++) {
    const x = (i + 0.5) * W / 24, y = (j + 0.5) * H / 60;
    const h = s.pick(x, y, true);                  // 形だけで見る(捨てる前)
    if (!h.point || !inside(-h.point[0], h.point[2])) continue;
    if (h.what === '遠景' || h.what === '地平') pts.push([x, y]);
  }
  s.groundOnly(true); s.debugGround(true); s.render();
  const cv = s._canvas(), k = cv.width / W;
  const g = document.createElement('canvas'); g.width = cv.width; g.height = cv.height;
  const c = g.getContext('2d'); c.drawImage(cv, 0, 0);
  let shown = 0; const rows = new Set();
  for (const [x, y] of pts) {
    const d = c.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
    const vis = s.pick(x, y);                        // 描画どおりの判定
    if (d[0] > d[1] * 1.25 && vis.point && inside(-vis.point[0], vis.point[2])) { shown++; rows.add(Math.round(y)); }
  }
  s.debugGround(false); s.groundOnly(false); s.render();
  return { poke: pts.length, shown, rows: [...rows].slice(0, 5) };
};

const shots = [];
for (const v of VIEWS) {
  for (const mode of ['nocut', 'now']) {
    await p.goto(`${BASE}?harness&seed=17&cam=${v.cam}${mode === 'nocut' ? '&nocut' : ''}`, { waitUntil: 'networkidle0', timeout: 120000 });
    await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
    const r = await p.evaluate(measure, v);
    const img = await p.screenshot({ encoding: 'base64' });
    shots.push({ v, mode, r, img });
    const tag = mode === 'nocut' ? '直す前' : 'いま  ';
    console.log(`  ${v.label} ${tag}: 形の上で粗い層が上にある ${r.poke}点 → 画面に突き抜けて見えている ${r.shown}点${r.shown ? `(画面の高さ ${r.rows.join(',')}px)` : ''}`);
  }
  const now = shots[shots.length - 1].r;
  check(`${v.label}: 粗い層が突き抜けて見えない`, now.shown === 0);
}
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));

const sh = await b.newPage(); await sh.setViewport({ width: 1400, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}
h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px;display:block}
figcaption{font-size:11px;text-align:center;opacity:.85;padding-top:4px}</style>
<h2>地面の層の境目（左＝直す前 / 右＝いま）</h2>
<div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.v.label}・${s.mode === 'nocut' ? '直す前' : 'いま'}（突き抜け ${s.r.shown}点）</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0', timeout: 120000 });
await sh.screenshot({ path: 'screenshots/_層の境目.png', fullPage: true });
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
