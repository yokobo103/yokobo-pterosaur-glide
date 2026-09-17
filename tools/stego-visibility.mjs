// 普通に飛ぶと、ステゴサウルスはどれくらい近くに来て、画面で何ピクセルに見えるのか(描画せずに計算)
import { Terrain, ThermalField, Herds, HERD, TUNE, WORLDS } from '../src/world.js';
import { Glider, Autopilot, AIR, sunlight } from '../src/flight.js';
Object.assign(TUNE, WORLDS.hills);
const FOV_V = 70 * Math.PI / 180, W = 390, H = 844;            // スマホ縦
const pxOf = (size, dist) => (size / dist) / (2 * Math.tan(FOV_V / 2)) * H;   // 画面上の大きさ
const LEN = 7 * HERD.scale;
console.log(`全長${LEN}mのステゴサウルスの見え方(スマホ縦):`);
for (const d of [100, 200, 400, 800, 1300]) console.log(`  ${d}m先 -> ${pxOf(LEN, d).toFixed(1)}px`);
console.log('');
const rows = [];
for (const seed of [17, 41, 113, 7, 88]) {
  const t = new Terrain(seed), f = new ThermalField(t, seed), herds = new Herds(t);
  const g = new Glider(t, f), ap = new Autopilot();
  const dt = 0.25;
  let best = { d: 1e9 }, closeTime = 0, seenTime = 0, dustTime = 0;
  while (g.alive && g.time < AIR.day * 1.6) {
    g.step(dt, ap.input(g, dt));
    herds.update(g.x, g.y, dt);
    if ([...herds.herdsNear(g.x, g.y, 3000)].length) dustTime += dt;   // 3km以内に群れがいる(踏み跡が見える範囲)
    for (const { a, d } of herds.near(g.x, g.y, 3000)) {
      const dist = Math.hypot(d, g.agl);                        // 斜めの距離(高さこみ)
      if (dist < best.d) best = { d: dist, agl: g.agl, px: pxOf(LEN, dist), t: g.time };
      if (dist < HERD.show) closeTime += dt / herds.near(g.x, g.y, 3000).length;
      if (pxOf(LEN, dist) > 8) seenTime += dt / herds.near(g.x, g.y, 3000).length;
    }
  }
  rows.push({ seed, best, closeTime, seenTime, dist: g.best, time: g.time });
  console.log(`seed ${seed}: 走行${(g.time/60).toFixed(1)}分 / 一番近づいた個体 ${best.d.toFixed(0)}m(画面${best.px?.toFixed(1)}px) / 8px以上で見える時間 ${seenTime.toFixed(0)}秒 / 踏み跡が見える範囲にいた時間 ${dustTime.toFixed(0)}秒(走行の${(dustTime/g.time*100).toFixed(0)}%)`);
}
