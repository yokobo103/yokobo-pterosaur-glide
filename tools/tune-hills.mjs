// 丘の高さを変えて、飛距離・激突・暇な時間を比べる
import { Terrain, ThermalField, TUNE, WORLDS } from '../src/world.js';
import { Glider, Autopilot, AIR, sunlight } from '../src/flight.js';
const SEEDS = [17, 41, 113, 7, 88, 3, 256, 901];
const CASES = [
  { name: '起伏なし', set: WORLDS.flat },
  { name: '丘 160m', set: { ...WORLDS.hills, mtnHeight: 160 } },
  { name: '丘 220m', set: WORLDS.hills },
  { name: '丘 300m', set: { ...WORLDS.hills, mtnHeight: 300 } },
];
const base = { ...TUNE };
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
console.log(' 条件     | 地面の高低差(95%) | 飛距離 | 走行 | 回った回数 | 静かな空気を滑るだけの最長 | 上り坂に激突して終わり');
for (const c of CASES) {
  Object.assign(TUNE, base, c.set);
  const R = []; const hs = [];
  for (const seed of SEEDS) {
    const t = new Terrain(seed), f = new ThermalField(t, seed);
    for (let x = -5000; x <= 5000; x += 250) for (let y = 0; y <= 20000; y += 500) hs.push(t.height(x, y));
    const g = new Glider(t, f), ap = new Autopilot();
    const dt = 0.25; let idle = 0, idleMax = 0;
    while (g.alive && g.time < AIR.day * 1.6) {
      g.step(dt, ap.input(g, dt));
      const thermal = g.lift + TUNE.ambient;
      if (Math.abs(thermal) < 0.5 && ap.mode !== 'CLIMB') { idle += dt; idleMax = Math.max(idleMax, idle); } else idle = 0;
    }
    // 上り坂に激突: 落ちた地点の少し先が、そこより高い
    const ahead = t.height(g.x + Math.sin(g.head) * 150, g.y + Math.cos(g.head) * 150) - t.height(g.x, g.y);
    const crash = !g.alive && sunlight(g.time) > 0.2 && ahead > 8;
    R.push({ dist: g.best, t: g.time, climbs: ap.stats.climbs, idleMax, crash });
  }
  hs.sort((a, b) => a - b);
  const relief = hs[Math.floor(hs.length * 0.975)] - hs[Math.floor(hs.length * 0.025)];
  console.log(` ${c.name.padEnd(8)} |      ${relief.toFixed(0).padStart(4)}m       | ${(avg(R.map(r=>r.dist))/1000).toFixed(1).padStart(4)}km | ${(avg(R.map(r=>r.t))/60).toFixed(1)}分 |  ${avg(R.map(r=>r.climbs)).toFixed(1)}回  |   ${Math.max(...R.map(r=>r.idleMax)).toFixed(0).padStart(3)}秒(平均${avg(R.map(r=>r.idleMax)).toFixed(0)})          | ${R.filter(r=>r.crash).length}/${R.length}`);
}
