// 低空の居心地: 低く飛ぶほど沈みにくいが、ただ飛びにはならないか(ブラウザ不要)
import { Terrain, ThermalField, TUNE, WORLDS } from '../src/world.js';
import { Glider, Autopilot, AIR } from '../src/flight.js';
Object.assign(TUNE, WORLDS.hills);
const SINK = 2.35;                    // 巡航時の機体の沈下 [m/s]
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };

// 柱の外での正味の上下(中央値)。上昇風の柱は数えない
function net(agl, sun = 1) {
  const t = new Terrain(17), f = new ThermalField(t, 17);
  const v = [];
  for (let k = 0; k < 3000; k++) {
    const x = (Math.random() - 0.5) * 16000, y = (Math.random() - 0.5) * 16000;
    if (t.height(x, y) < t.water + 2) continue;
    v.push(f.slopeLift(x, y, t.height(x, y) + agl, sun) - TUNE.ambient - SINK);
  }
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}
const n25 = net(25), n60 = net(60), n120 = net(120), dusk = net(25, 0.2);
console.log(`  柱の外の正味[m/s] 高さ25m ${n25.toFixed(2)} / 60m ${n60.toFixed(2)} / 120m ${n120.toFixed(2)} / 夕方の25m ${dusk.toFixed(2)}`);
check(`低く飛べば沈みにくい(25mで ${n25.toFixed(2)} m/s、60mから${(60 / -n60).toFixed(0)}秒)`, n25 > -0.9);
check(`中くらいの高さは変わらない(120mで ${n120.toFixed(2)} m/s)`, n120 < -1.9);
check(`日が暮れると低空でも沈む(${dusk.toFixed(2)} m/s)`, dusk < -1.5);

let dist = 0, low = 0, total = 0, n = 0, straight = 0;
for (const seed of [17, 41, 113, 7, 88, 3, 256, 901]) {
  const t = new Terrain(seed), f = new ThermalField(t, seed);
  const g = new Glider(t, f), ap = new Autopilot();
  const dt = 0.25;
  while (g.alive && g.time < AIR.day * 1.6) {
    g.step(dt, ap.input(g, dt));
    if (g.agl < 120) low += dt;
    total += dt;
  }
  dist += g.best; n++;
  const t2 = new Terrain(seed), f2 = new ThermalField(t2, seed), g2 = new Glider(t2, f2);
  while (g2.alive && g2.time < AIR.day * 1.6) g2.step(dt, 0);
  straight += g2.best;
}
const km = dist / n / 1000, sk = straight / n / 1000;
console.log(`  自動操縦 平均${km.toFixed(2)}km / 直進 ${sk.toFixed(2)}km / 低空(120m以下)で過ごす割合 ${(low / total * 100).toFixed(0)}%`);
check(`飛距離が壊れていない(${km.toFixed(2)}km)`, km > 7.5 && km < 14);
check(`上昇風を使う腕の差が残る(直進の${(km / sk).toFixed(1)}倍)`, km / sk >= 2.0);
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
