// 地面近くの暖まった空気(warmK)の強さを振って、低空の居やすさ・飛距離・低空時間を測る
import { Terrain, ThermalField, TUNE, WORLDS } from '../src/world.js';
import { Glider, Autopilot, AIR } from '../src/flight.js';
Object.assign(TUNE, WORLDS.hills);
const SEEDS = [17, 41, 113, 7, 88, 3, 256, 901];
const SINK = 2.35;                    // 巡航時の機体の沈下 [m/s](TUNE.ambient は別に引く)

function surface(K, agl, H) {
  TUNE.warmK = K; TUNE.warmH = H;
  const t = new Terrain(17), f = new ThermalField(t, 17);
  const nets = [];
  for (let k = 0; k < 4000; k++) {
    const x = (Math.random() - 0.5) * 16000, y = (Math.random() - 0.5) * 16000;
    if (t.height(x, y) < t.water + 2) continue;
    const z = t.height(x, y) + agl;
    nets.push(f.slopeLift(x, y, z, 1) - TUNE.ambient - SINK);   // 柱の外での正味の上下
  }
  nets.sort((a, b) => a - b);
  const med = nets[Math.floor(nets.length / 2)], p90 = nets[Math.floor(nets.length * 0.9)];
  return { med, p90, hold: nets.filter(v => v > -0.3).length / nets.length * 100 };
}

function fly(K, H) {
  TUNE.warmK = K; TUNE.warmH = H;
  let dist = 0, low = 0, total = 0, n = 0;
  for (const seed of SEEDS) {
    const t = new Terrain(seed), f = new ThermalField(t, seed);
    const g = new Glider(t, f), ap = new Autopilot();
    const dt = 0.25;
    while (g.alive && g.time < AIR.day * 1.6) {
      g.step(dt, ap.input(g, dt));
      if (g.agl < 120) low += dt;
      total += dt;
    }
    dist += g.best; n++;
  }
  return { km: dist / n / 1000, lowPct: low / total * 100, min: total / n / 60 };
}

for (const [K, H] of [[0, 70], [8, 45], [10, 45], [9, 55], [7, 70], [6, 70]]) {
  const s25 = surface(K, 25, H), s60 = surface(K, 60, H), s120 = surface(K, 120, H);
  const f = fly(K, H);
  console.log(`  強さ${String(K).padStart(3)} 効き幅${H}m: 正味[m/s] 25m ${s25.med.toFixed(2)} / 60m ${s60.med.toFixed(2)} / 120m ${s120.med.toFixed(2)}` +
              ` / 60mから${(60 / -s60.med).toFixed(0)}秒 / 保てる土地(25m)${s25.hold.toFixed(0)}%` +
              ` / 自動操縦 ${f.km.toFixed(2)}km・${f.min.toFixed(1)}分・低空${f.lowPct.toFixed(0)}%`);
}
