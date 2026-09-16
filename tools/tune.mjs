// ブラウザなしで縮尺を詰める。1走行の長さ・乗り継ぎ回数・飛距離を出す。
import { Terrain, ThermalField, TUNE } from '../src/world.js';
import { Glider, Autopilot, AIR, glideRatio, effGlide, sink, sunlight } from '../src/flight.js';

const SEEDS = [17, 41, 113, 7, 88, 3, 256, 901];
function run(seed, apOpts = {}, dt = 0.25) {
  const t = new Terrain(seed), f = new ThermalField(t, seed);
  const g = new Glider(t, f), ap = new Autopilot(apOpts);
  let circleT = 0;
  while (g.alive && g.time < AIR.day * 1.6) {
    const i = ap.input(g, dt);
    if (Math.abs(i) > 0.8) circleT += dt;
    g.step(dt, i);
  }
  return { dist: g.best, t: g.time, climbs: ap.stats.climbs, circleFrac: circleT / g.time };
}
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
console.log(`滑空比 ${glideRatio(AIR.Vcruise).toFixed(1)} (沈下こみ ${effGlide(AIR.Vcruise).toFixed(1)}) @ ${AIR.Vcruise}m/s`);
console.log(`開始高度${AIR.startAlt}m -> 何も乗らなければ ${(AIR.startAlt*effGlide(AIR.Vcruise)/1000).toFixed(2)}km`);
console.log(`旋回時 沈下${(sink(AIR.Vcircle) * Math.pow(1 / Math.cos(AIR.bankMax), 1.5)).toFixed(2)}m/s  旋回半径${(AIR.Vcircle / (AIR.g * Math.tan(AIR.bankMax) / AIR.Vcircle)).toFixed(0)}m  1周${(2 * Math.PI / (AIR.g * Math.tan(AIR.bankMax) / AIR.Vcircle)).toFixed(1)}s`);
console.log(`上昇風 強さ${TUNE.Wmin}〜${TUNE.Wmax}m/s -> 旋回中の差引 ${(TUNE.Wmin - sink(AIR.Vcircle) * Math.pow(1 / Math.cos(AIR.bankMax), 1.5)).toFixed(2)}〜${(TUNE.Wmax - sink(AIR.Vcircle) * Math.pow(1 / Math.cos(AIR.bankMax), 1.5)).toFixed(2)}m/s\n`);

const R = SEEDS.map(s => run(s));
const straight = SEEDS.map(s => run(s, { Wmin: 99 }));
console.log(' seed | 飛距離 | 走行時間 | 乗継 | 旋回割合');
SEEDS.forEach((s, i) => console.log(` ${String(s).padStart(4)} | ${(R[i].dist / 1000).toFixed(2).padStart(5)}km | ${(R[i].t / 60).toFixed(1).padStart(5)}分 | ${String(R[i].climbs).padStart(3)}回 | ${(R[i].circleFrac * 100).toFixed(0).padStart(3)}%`));
console.log(`\n 上昇風を使う   平均 ${(avg(R.map(r => r.dist)) / 1000).toFixed(2)}km / ${(avg(R.map(r => r.t)) / 60).toFixed(1)}分 / 乗継${avg(R.map(r => r.climbs)).toFixed(1)}回`);
console.log(` 使わず直進     平均 ${(avg(straight.map(r => r.dist)) / 1000).toFixed(2)}km / ${(avg(straight.map(r => r.t)) / 60).toFixed(1)}分`);
console.log(` 差 ${(avg(R.map(r => r.dist)) / avg(straight.map(r => r.dist))).toFixed(1)}倍`);
