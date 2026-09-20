// 歩く恐竜すべて: 世界に出るか、歩くか、足が滑らないか、接地しているか、発見になるか
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
// three.js は読み込むときに骨の名前から「.」を落とす(Tail.04 -> Tail04)
const KINDS = [
  { id: 'tricera', name: 'トリケラトプス', found: 'tricera_herd', bones: ['Head', 'Tail04', 'ForeLFoot', 'ForeRFoot', 'HindLFoot', 'HindRFoot'], near: 90 },
  { id: 'brachio', name: 'ブラキオサウルス', found: 'brachio_group', bones: ['Head', 'Tail04', 'ForeLFoot', 'ForeRFoot', 'HindLFoot', 'HindRFoot'], near: 220 },
  { id: 'allo', name: 'アロサウルス', found: 'allo', bones: ['Head', 'Tail04', 'LegLFoot', 'LegRFoot'], near: 90 },
];
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.dinosReady(), { timeout: 120000 });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };
const med = v => { const q = [...v].sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
const SX = -1, dt = 1 / 60;
const shots = [];

for (const k of KINDS) {
  console.log(`\n== ${k.name} ==`);
  const herds = await p.evaluate(id => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    return s.herdsNear(0, 0, 14000, id).sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy));
  }, k.id);
  console.log(`  14km以内 ${herds.length}か所 / 一番近い ${herds.length ? Math.round(Math.hypot(herds[0].cx, herds[0].cy)) + 'm' : '-'} / 頭数 ${herds[0]?.n ?? '-'}`);
  check('世界にいる', herds.length >= 1 && herds[0].n >= 1);
  if (!herds.length) continue;
  const herd = herds[0];

  const rec = await p.evaluate(({ herd, k }) => {
    const s = window.__slice;
    s.place(herd.cx, herd.cy - k.near, k.near * 0.35, 0);
    for (let i = 0; i < 60 * 5; i++) s.render();
    const frames = [];
    for (let i = 0; i < 60 * 10; i++) { s.render(); frames.push(s.creatures(k.id, k.bones)); }
    return frames;
  }, { herd, k });
  const byId = {}, dots = [], contact = [], ground = [];
  let walking = 0;
  for (const fr of rec) for (const a of fr) (byId[a.id] = byId[a.id] || []).push(a);
  for (const seq of Object.values(byId)) {
    for (const a of seq) {
      const feet = a.feet.filter(Boolean);
      if (feet.length) ground.push(Math.min(...feet.map(f => f[1])) - a.ground);
      if (a.state !== 'walk' || !a.headBone || !a.tailBone) continue;
      walking++;
      const hx = a.headBone[0] - a.tailBone[0], hz = a.headBone[2] - a.tailBone[2];
      const n = Math.hypot(hx, hz) || 1;
      dots.push((hx * SX * Math.sin(a.head) + hz * Math.cos(a.head)) / n);
    }
    for (let f = 0; f < k.bones.length - 2; f++) {
      const ys = seq.map(a => (a.feet[f] ? a.feet[f][1] - a.ground : NaN));
      const low = Math.min(...ys.filter(v => !Number.isNaN(v)));
      for (let i = 1; i < seq.length; i++) {
        if (seq[i].state !== 'walk' || seq[i - 1].state !== 'walk') continue;
        if (!(ys[i] - low < 0.06) || !(ys[i - 1] - low < 0.06)) continue;
        if (Math.abs(seq[i].head - seq[i - 1].head) / dt > 0.02) continue;
        const a0 = seq[i - 1].feet[f], a1 = seq[i].feet[f];
        contact.push(Math.hypot(a1[0] - a0[0], a1[2] - a0[2]) / dt);
      }
    }
  }
  const cfg = await p.evaluate(id => window.__slice.speciesTune(id), k.id);
  const speed = cfg.walk * cfg.timeScale * cfg.scale;
  console.log(`  記録 ${Object.keys(byId).length}頭 / 歩いているコマ ${walking} / 歩く速さ ${speed.toFixed(2)} m/s`);
  check(`歩く個体がいる(${walking}コマ)`, walking > 60);
  check(`頭が進む向きを向いている(${dots.length ? med(dots).toFixed(2) : '-'})`, dots.length > 0 && med(dots) > 0.85);
  check(`接地中の足が滑らない(${contact.length ? med(contact).toFixed(2) : '-'} m/s / 歩く速さ ${speed.toFixed(2)})`,
        contact.length > 0 && med(contact) < 0.3 * speed);
  check(`足が地面に着いている(差 ${med(ground).toFixed(2)}m)`, Math.abs(med(ground)) < 0.9 * cfg.scale);

  const found = await p.evaluate(({ herd, k }) => {
    const s = window.__slice; s.place(herd.cx, herd.cy - 150, 70, 0);
    for (let i = 0; i < 90; i++) s.step(1 / 60, true);
    return s.found().map(f => f.id);
  }, { herd, k });
  check('近づくと発見になる', found.includes(k.found));
  await p.evaluate(({ herd, k }) => {
    const s = window.__slice; s.place(herd.cx, herd.cy - k.near * 1.4, k.near * 0.4, 0);
    for (let i = 0; i < 40; i++) s.render();
  }, { herd, k });
  shots.push({ label: k.name, img: await p.screenshot({ encoding: 'base64', clip: { x: 0, y: 260, width: 390, height: 460 } }) });
}
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));

const sh = await b.newPage(); await sh.setViewport({ width: 1320, height: 580 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:4px}figcaption{font-size:12px;text-align:center}</style>
<h2>新しい恐竜（歩く）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_新しい恐竜.png', fullPage: true });
await b.close();
console.log(fails ? `\n${fails}件 FAIL` : '\n全件 PASS');
process.exit(fails ? 1 : 0);
