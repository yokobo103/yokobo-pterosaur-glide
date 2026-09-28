// 歩く恐竜の足を1コマずつ見る: 地面からの高さと、水平の速さ、向きの変わり方
//   node tools/with-dist.mjs tools/diag-walker-feet.mjs trex allo
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const KIND_BONES = { trex: ['Head', 'Tail04', 'LegLFoot', 'LegRFoot'], allo: ['Head', 'Tail04', 'LegLFoot', 'LegRFoot'] };
const kinds = process.argv.slice(2).filter(a => KIND_BONES[a]);
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.dinosReady(), { timeout: 120000 });
const dt = 1 / 60;
for (const id of kinds) {
  const rec = await p.evaluate(({ id, bones }) => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    const h = s.herdsNear(0, 0, 14000, id).sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0];
    s.place(h.cx, h.cy - 120, 42, 0);
    for (let i = 0; i < 600; i++) s.render();
    const out = [];
    for (let i = 0; i < 360; i++) { s.render(); out.push(s.creatures(id, bones)[0]); }
    return { out, cfg: s.speciesTune(id) };
  }, { id, bones: KIND_BONES[id] });
  const seq = rec.out.filter(Boolean);
  const speed = rec.cfg.walk * rec.cfg.timeScale * rec.cfg.scale;
  console.log(`\n== ${id} walk×scale ${speed.toFixed(2)} m/s / ${seq.length} コマ`);
  for (let f = 0; f < 2; f++) {
    const ys = seq.map(a => a.feet[f] ? a.feet[f][1] - a.ground : NaN);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    console.log(`  足${f}: 地面からの高さ 最低 ${lo.toFixed(2)} 最高 ${hi.toFixed(2)} (幅 ${(hi - lo).toFixed(2)}m)`);
    // 高さの低い順に1/3のコマ(=接地しているはずのコマ)の水平の速さ
    const v = [];
    for (let i = 1; i < seq.length; i++) {
      const a0 = seq[i - 1].feet[f], a1 = seq[i].feet[f];
      if (!a0 || !a1 || seq[i].state !== 'walk') continue;
      v.push({ y: ys[i], v: Math.hypot(a1[0] - a0[0], a1[2] - a0[2]) / dt, turn: Math.abs(seq[i].head - seq[i - 1].head) / dt });
    }
    v.sort((a, b) => a.y - b.y);
    const low = v.slice(0, Math.floor(v.length / 3)).map(x => x.v).sort((a, b) => a - b);
    const turn = v.map(x => x.turn).sort((a, b) => a - b);
    console.log(`  足${f}: 低いコマの速さ 中央 ${low.length ? low[Math.floor(low.length / 2)].toFixed(2) : '-'} m/s / 向き変え 中央 ${turn.length ? turn[Math.floor(turn.length / 2)].toFixed(3) : '-'} rad/s`);
  }
  const g = seq.map(a => a.ground); console.log(`  地面の高さの変化 ${(Math.max(...g) - Math.min(...g)).toFixed(2)}m / 状態 ${[...new Set(seq.map(a => a.state))].join(',')}`);
}
await b.close();
