// 山と尾根の上昇風で「暇な時間」が減るかを測る。
import { Terrain, ThermalField, TUNE } from '../src/world.js';
import { Glider, Autopilot, AIR, sunlight } from '../src/flight.js';
const SEEDS = [17, 41, 113, 7, 88, 3];
const CASES = [
  { name: '山なし(いま)',               set: { mtn: 0, windSpeed: 0 } },
  { name: '山550m・間隔1600m・風11',   set: { mtn: 1, mtnHeight: 550, mtnWave: 1600, windSpeed: 11 } },
  { name: '山700m・間隔2200m・風11',   set: { mtn: 1, mtnHeight: 700, mtnWave: 2200, windSpeed: 11 } },
  { name: '山脈550m・裾700m・風11',     set: { mtn: 1, mtnMode: 'ranges', mtnHeight: 550, rangeWidth: 700, windSpeed: 11 } },
  { name: '山脈550m・上昇が高くまで届く', set: { mtn: 1, mtnMode: 'ranges', mtnHeight: 550, rangeWidth: 700, windSpeed: 11, ridgeH: 240, leeCap: 2.5 } },
  { name: '山脈450m・裾600m・風10',     set: { mtn: 1, mtnMode: 'ranges', mtnHeight: 450, rangeWidth: 600, windSpeed: 10, ridgeH: 240, leeCap: 2.5 } },
];
const base = { ...TUNE };
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
console.log(' 条件                         | 飛距離 | 走行 | 回った回数 | 静かな空気を滑るだけの最長 | その合計 | 尾根で上昇中 | 山に激突');
for (const c of CASES) {
  Object.assign(TUNE, base, c.set);
  const R = [];
  for (const seed of SEEDS) {
    const t = new Terrain(seed), f = new ThermalField(t, seed);
    const g = new Glider(t, f), ap = new Autopilot();
    const dt = 0.25;
    let idle = 0, idleMax = 0, idleSum = 0, ridgeT = 0;
    while (g.alive && g.time < AIR.day * 1.6) {
      const u = ap.input(g, dt);
      g.step(dt, u);
      const sun = sunlight(g.time);
      const ridge = f.ridgeAt(g.x, g.y, g.z, sun);
      const thermal = g.lift - ridge + TUNE.ambient;          // 上昇気流ぶん
      if (ridge > 1.0) ridgeT += dt;
      // 暇 = ほぼまっすぐで、上昇も下降の変化もない静かな空気を滑っているだけ
      const quiet = Math.abs(ridge) < 0.5 && Math.abs(thermal) < 0.5 && ap.mode !== 'CLIMB';   // 静かな空気を滑っているだけ
      if (quiet) { idle += dt; idleMax = Math.max(idleMax, idle); idleSum += dt; } else idle = 0;
    }
    const gz = t.height(g.x, g.y);
    const crash = !g.alive && sunlight(g.time) > 0.25 && t.slope(g.x, g.y, 40) > 0.3;
    R.push({ dist: g.best, t: g.time, climbs: ap.stats.climbs, idleMax, idleFrac: idleSum / g.time, ridgeFrac: ridgeT / g.time, crash });
  }
  console.log(` ${c.name.padEnd(28)} | ${(avg(R.map(r=>r.dist))/1000).toFixed(1).padStart(5)}km | ${(avg(R.map(r=>r.t))/60).toFixed(1)}分 | ${avg(R.map(r=>r.climbs)).toFixed(1).padStart(4)}回 | ${Math.max(...R.map(r=>r.idleMax)).toFixed(0).padStart(4)}秒(平均${avg(R.map(r=>r.idleMax)).toFixed(0)}) | ${(avg(R.map(r=>r.idleFrac))*100).toFixed(0).padStart(3)}% | ${(avg(R.map(r=>r.ridgeFrac))*100).toFixed(0).padStart(3)}% | ${R.filter(r=>r.crash).length}/${R.length}`);
}
