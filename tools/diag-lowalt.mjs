// いま、走行のどれくらいを低空で過ごしているか(高さの分布)
import { Terrain, ThermalField, TUNE, WORLDS } from '../src/world.js';
import { Glider, Autopilot, AIR, sunlight } from '../src/flight.js';
Object.assign(TUNE, WORLDS.hills);
const bins = [0, 40, 80, 120, 200, 300, 500, 1e9];
const time = new Array(bins.length - 1).fill(0);
let total = 0, dist = 0, n = 0;
for (const seed of [17, 41, 113, 7, 88, 3, 256, 901]) {
  const t = new Terrain(seed), f = new ThermalField(t, seed);
  const g = new Glider(t, f), ap = new Autopilot();
  const dt = 0.25;
  while (g.alive && g.time < AIR.day * 1.6) {
    g.step(dt, ap.input(g, dt));
    const a = g.agl;
    for (let i = 0; i < time.length; i++) if (a >= bins[i] && a < bins[i + 1]) { time[i] += dt; break; }
    total += dt;
  }
  dist += g.best; n++;
}
console.log('  自動操縦8走行の高さの分布(地面からの高さ):');
for (let i = 0; i < time.length; i++) {
  const lo = bins[i], hi = bins[i + 1] === 1e9 ? '∞' : bins[i + 1];
  console.log(`    ${String(lo).padStart(4)}〜${String(hi).padStart(4)}m: ${(time[i] / total * 100).toFixed(1)}% (${(time[i] / n).toFixed(0)}秒/走行)`);
}
console.log(`  平均飛距離 ${(dist / n / 1000).toFixed(2)}km / 1走行 ${(total / n / 60).toFixed(1)}分`);
