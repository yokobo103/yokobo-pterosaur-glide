// ステゴサウルス: 頭の向き・足の滑り・接地・絵
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.stegoReady(), { timeout: 90000 });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };
const herd = await p.evaluate(() => window.__slice.herdsNear(0, 0, 15000).sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0]);
console.log('一番近い群れ:', herd);
// 群れの手前60m・高さ25mで、群れの時間を進めながら骨を記録する
const rec = await p.evaluate(h => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  if (h.walk !== undefined) s.herdTune({ walk: h.walk });
  s.place(h.cx, h.cy - 60, 25, 0);
  for (let i = 0; i < 60 * 3; i++) s.render();          // 群れが動き出すまで
  const frames = [];
  for (let i = 0; i < 60 * 8; i++) { s.render(); frames.push(s.stegos()); }
  return frames;
}, { ...herd, walk: process.env.STEGO_WALK ? Number(process.env.STEGO_WALK) : undefined });
const dt = 1 / 60, SX = -1;
let dots = [], contact = [], contactTurn = [], ground = [], walkingFrames = 0;
const byId = {};
for (const fr of rec) for (const a of fr) (byId[a.id] = byId[a.id] || []).push(a);
for (const seq of Object.values(byId)) {
  for (const a of seq) {
    ground.push(Math.min(...a.feet.map(f => f[1])) - a.ground);
    if (a.state !== 'walk') continue;
    walkingFrames++;
    const hx = a.headBone[0] - a.tailBone[0], hz = a.headBone[2] - a.tailBone[2];
    const n = Math.hypot(hx, hz) || 1;
    dots.push((hx * SX * Math.sin(a.head) + hz * Math.cos(a.head)) / n);
  }
  // 足: 接地している間の水平の動きの速さ
  for (let f = 0; f < 4; f++) {
    const ys = seq.map(a => a.feet[f][1] - a.ground);
    const low = Math.min(...ys);
    for (let i = 1; i < seq.length; i++) {
      if (seq[i].state !== 'walk' || seq[i - 1].state !== 'walk') continue;
      if (ys[i] - low > 0.008 || ys[i - 1] - low > 0.008) continue;   // 足の持ち上げは10cmしかないので、接地は最低点から8mm以内
      const a0 = seq[i - 1].feet[f], a1 = seq[i].feet[f];
      const speed = Math.hypot(a1[0] - a0[0], a1[2] - a0[2]) / dt;
      const turning = Math.abs(seq[i].head - seq[i - 1].head) / dt > 0.02;   // 向きを変えている最中か
      (turning ? contactTurn : contact).push(speed);
    }
  }
}
const med = v => { const q = [...v].sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
console.log(`  歩いている記録 ${walkingFrames}コマ / 接地中の足の記録 まっすぐ${contact.length} 向きを変えながら${contactTurn.length}`);
console.log(`  向きを変えながら歩くときの接地中の足の速さ 中央値 ${contactTurn.length ? med(contactTurn).toFixed(2) : '-'} m/s`);
check(`頭が進む向きを向いている(向きの一致 ${dots.length ? med(dots).toFixed(2) : '-'}、1が完全一致)`, dots.length > 0 && med(dots) > 0.9);
check(`まっすぐ歩くとき、接地中の足が地面を滑らない(足の速さの中央値 ${contact.length ? med(contact).toFixed(2) : '-'} m/s / 歩く速さ ${((process.env.STEGO_WALK ? Number(process.env.STEGO_WALK) : 0.21) * 3).toFixed(2)} m/s)`, contact.length > 0 && med(contact) < 0.2);
check(`足が地面に着いている(一番低い足と地面の差 中央値 ${med(ground).toFixed(2)}m)`, Math.abs(med(ground)) < 0.35);
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
// 絵: 低空で近く / 少し上から群れ全体
// 群れの個体の平均位置に向かって撮る
const aim = await p.evaluate(() => { const l = window.__slice.stegos(); const x = l.reduce((q, a) => q + a.x, 0) / l.length, y = l.reduce((q, a) => q + a.y, 0) / l.length; return { x, y, n: l.length }; });
console.log('  描いている個体', aim.n);
await p.evaluate(a => { const s = window.__slice; s.place(a.x, a.y - 45, 14, 0); for (let i=0;i<20;i++) s.render(); }, aim);
const near = await p.screenshot({ encoding: 'base64' });
await p.evaluate(a => { const s = window.__slice; s.place(a.x, a.y - 160, 45, 0); for (let i=0;i<20;i++) s.render(); }, aim);
const far = await p.screenshot({ encoding: 'base64' });
const sh = await b.newPage();
await sh.setViewport({ width: 900, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:16px;background:#14181e;color:#e8eef7;font-family:system-ui}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:13px;text-align:center;margin-top:4px}</style>
<div class="row"><figure><img src="data:image/png;base64,${near}"><figcaption>群れの45m手前・高さ14m</figcaption></figure><figure><img src="data:image/png;base64,${far}"><figcaption>群れの160m手前・高さ45m</figcaption></figure></div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_ステゴサウルス.png', fullPage: true });
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
