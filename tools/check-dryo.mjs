// ドリオサウルス: 群れが出るか、歩くか、足が滑らないか、接地しているか、発見になるか
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.dryoReady(), { timeout: 90000 });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };

const herds = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  return s.herdsNear(0, 0, 12000, 'dryo').sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy));
});
console.log(`  12km以内の一団 ${herds.length}か所 / 一番近い ${herds.length ? Math.round(Math.hypot(herds[0].cx, herds[0].cy)) + 'm' : '-'} / 頭数 ${herds[0]?.n}`);
check('世界にドリオの一団がいる', herds.length >= 2 && herds[0].n >= 3);
if (!herds.length) { await b.close(); process.exit(1); }
const herd = herds[0];

// 群れの手前60m・高さ22mで、群れの時間を進めながら骨を記録する
const rec = await p.evaluate(h => {
  const s = window.__slice;
  s.place(h.cx, h.cy - 60, 22, 0);
  for (let i = 0; i < 60 * 4; i++) s.render();            // 歩き出すまで
  const frames = [];
  for (let i = 0; i < 60 * 10; i++) { s.render(); frames.push(s.dryos()); }
  return frames;
}, herd);
const dt = 1 / 60, SX = -1;
const byId = {}, dots = [], contact = [], ground = [];
let walking = 0;
for (const fr of rec) for (const a of fr) (byId[a.id] = byId[a.id] || []).push(a);
for (const seq of Object.values(byId)) {
  for (const a of seq) {
    ground.push(Math.min(...a.feet.map(f => f && f[1]).filter(v => v != null)) - a.ground);
    if (a.state !== 'walk' || !a.headBone || !a.tailBone) continue;
    walking++;
    const hx = a.headBone[0] - a.tailBone[0], hz = a.headBone[2] - a.tailBone[2];
    const n = Math.hypot(hx, hz) || 1;
    dots.push((hx * SX * Math.sin(a.head) + hz * Math.cos(a.head)) / n);
  }
  // 接地している間の足の動きの速さ(滑っていないか)
  for (let f = 0; f < 2; f++) {
    const ys = seq.map(a => (a.feet[f] ? a.feet[f][1] - a.ground : NaN));
    const low = Math.min(...ys.filter(v => !Number.isNaN(v)));
    for (let i = 1; i < seq.length; i++) {
      if (seq[i].state !== 'walk' || seq[i - 1].state !== 'walk') continue;
      if (!(ys[i] - low < 0.05) || !(ys[i - 1] - low < 0.05)) continue;    // 足が一番低い位置の近く=接地
      if (Math.abs(seq[i].head - seq[i - 1].head) / dt > 0.02) continue;   // 向きを変えている最中は除く
      const a0 = seq[i - 1].feet[f], a1 = seq[i].feet[f];
      contact.push(Math.hypot(a1[0] - a0[0], a1[2] - a0[2]) / dt);
    }
  }
}
const med = v => { const q = [...v].sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
const scale = await p.evaluate(() => window.__slice.speciesTune('dryo'));
const speed = scale.walk * scale.timeScale * scale.scale;
console.log(`  記録した個体 ${Object.keys(byId).length}頭 / 歩いているコマ ${walking} / 歩く速さ ${speed.toFixed(2)} m/s`);
check(`歩く個体がいる(${walking}コマ)`, walking > 60);
check(`頭が進む向きを向いている(向きの一致 ${dots.length ? med(dots).toFixed(2) : '-'}、1が完全一致)`, dots.length > 0 && med(dots) > 0.9);
check(`接地中の足が地面を滑らない(足の速さの中央値 ${contact.length ? med(contact).toFixed(2) : '-'} m/s / 歩く速さ ${speed.toFixed(2)} m/s)`,
      contact.length > 0 && med(contact) < 0.25 * speed);
check(`足が地面に着いている(一番低い足と地面の差 中央値 ${med(ground).toFixed(2)}m / 大きさ${scale.scale}倍)`, Math.abs(med(ground)) < 0.35 * scale.scale);

// 近づくと発見になる
const found = await p.evaluate(h => {
  const s = window.__slice; s.place(h.cx, h.cy - 120, 60, 0);
  for (let i = 0; i < 60; i++) s.step(1 / 60, true);
  return { found: s.found().map(f => f.id), toast: s.foundVisible() };
}, herd);
console.log(`  一団に近づく -> 知らせ「${found.toast ?? 'なし'}」`);
check('近づくと発見になる', found.found.includes('dryo_group'));
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));

// 絵: 低空・少し上・遠く
const shots = [];
for (const [d, alt] of [[40, 12], [90, 26], [260, 70]]) {
  await p.evaluate(({ h, d, alt }) => {
    const s = window.__slice; s.place(h.cx, h.cy - d, alt, 0);
    for (let i = 0; i < 40; i++) s.render();
  }, { h: herd, d, alt });
  shots.push({ label: `${d}m手前 / 高さ${alt}m`, img: await p.screenshot({ encoding: 'base64' }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1300, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:16px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:15px;margin:0 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:12px;text-align:center;margin-top:4px}</style>
<h2>ドリオサウルスの一団（歩く）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_ドリオサウルス.png', fullPage: true });
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
