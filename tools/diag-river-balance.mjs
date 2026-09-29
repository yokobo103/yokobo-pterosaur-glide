// 川を入れて飛距離の釣り合いが崩れていないか。川なし / 幅ごとに、自動操縦と直進の飛距離を比べる
// (上昇気流は水の上に湧かないので、川を渡るぶん不利になるはず。どれだけかを見る)
import { Terrain, ThermalField, TUNE, WORLDS } from '../src/world.js';
import { Glider, Autopilot, AIR } from '../src/flight.js';
Object.assign(TUNE, WORLDS.hills);
const SEEDS = [17, 41, 113, 7, 88, 3, 256, 901];
const run = () => {
  let ap = 0, st = 0, wet = 0, tot = 0;
  for (const seed of SEEDS) {
    const t = new Terrain(seed), f = new ThermalField(t, seed), g = new Glider(t, f), a = new Autopilot();
    while (g.alive && g.time < AIR.day * 1.6) {
      g.step(0.25, a.input(g, 0.25));
      if (t.height(g.x, g.y) < t.water) wet++;
      tot++;
    }
    ap += g.best;
    const t2 = new Terrain(seed), f2 = new ThermalField(t2, seed), g2 = new Glider(t2, f2);
    while (g2.alive && g2.time < AIR.day * 1.6) g2.step(0.25, 0);
    st += g2.best;
  }
  return { ap: ap / SEEDS.length / 1000, st: st / SEEDS.length / 1000, wet: 100 * wet / tot };
};
for (const [label, on, w] of [['川なし', 0, 260], ['幅150m', 1, 150], ['幅260m', 1, 260], ['幅420m', 1, 420]]) {
  TUNE.river = on; TUNE.riverWidth = w;
  const r = run();
  console.log(`  ${label.padEnd(6)}: 自動操縦 ${r.ap.toFixed(2)}km / 直進 ${r.st.toFixed(2)}km / 水の上を飛んだ時間 ${r.wet.toFixed(1)}%`);
}
